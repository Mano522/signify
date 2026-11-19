import {
  fetchRecommendedSongs as fetchAudiusRecommended,
  searchSongs as searchAudiusSongs,
} from './audiusService.js';
import {
  fetchRecommendedSongs as fetchJamendoRecommended,
  searchSongs as searchJamendoSongs,
} from './jamendoService.js';
import {
  getDeezerTopTracks,
  searchDeezer,
} from './deezerService.js';

const MAX_RESULTS = 100;
const CACHE_TTL_MS = 60_000;
const PROVIDER_TIMEOUT_MS = 12_000;
const responseCache = new Map();
const SOURCE_LIMITS = {
  recommended: {
    audius: 24,
    jamendo: 24,
    deezer: 24,
  },
  search: {
    audius: 40,
    jamendo: 40,
    deezer: 25,
  },
};

const LANGUAGE_DEFINITIONS = [
  { key: 'all', label: 'All Languages', hint: '' },
  { key: 'hindi', label: 'Hindi', hint: 'hindi bollywood' },
  { key: 'tamil', label: 'Tamil', hint: 'tamil kollywood' },
  { key: 'telugu', label: 'Telugu', hint: 'telugu tollywood' },
  { key: 'malayalam', label: 'Malayalam', hint: 'malayalam mollywood' },
  { key: 'kannada', label: 'Kannada', hint: 'kannada sandalwood' },
  { key: 'punjabi', label: 'Punjabi', hint: 'punjabi bhangra' },
  { key: 'bengali', label: 'Bengali', hint: 'bengali bangla' },
  { key: 'marathi', label: 'Marathi', hint: 'marathi' },
  { key: 'gujarati', label: 'Gujarati', hint: 'gujarati' },
  { key: 'english', label: 'English', hint: 'english international' },
];

export const REGIONAL_LANGUAGES = LANGUAGE_DEFINITIONS.map(({ key, label }) => ({ key, label }));

const REGIONAL_PRIORITY_ORDER = ['hindi', 'tamil', 'telugu', 'malayalam', 'kannada', 'punjabi', 'bengali', 'marathi', 'gujarati'];

const LANGUAGE_KEYWORDS = {
  hindi: ['hindi', 'bollywood', 'desi', 'indian'],
  tamil: ['tamil', 'kollywood', 'tamizh'],
  telugu: ['telugu', 'tollywood'],
  malayalam: ['malayalam', 'mollywood'],
  kannada: ['kannada', 'sandalwood'],
  punjabi: ['punjabi', 'bhangra'],
  bengali: ['bengali', 'bangla'],
  marathi: ['marathi'],
  gujarati: ['gujarati'],
  english: ['english'],
};

const SCRIPT_RULES = [
  { key: 'hindi', pattern: /[\u0900-\u097F]/ },
  { key: 'bengali', pattern: /[\u0980-\u09FF]/ },
  { key: 'gujarati', pattern: /[\u0A80-\u0AFF]/ },
  { key: 'punjabi', pattern: /[\u0A00-\u0A7F]/ },
  { key: 'tamil', pattern: /[\u0B80-\u0BFF]/ },
  { key: 'telugu', pattern: /[\u0C00-\u0C7F]/ },
  { key: 'kannada', pattern: /[\u0C80-\u0CFF]/ },
  { key: 'malayalam', pattern: /[\u0D00-\u0D7F]/ },
];

const normalize = (value) => String(value || '').trim().toLowerCase();
const withCache = (key, load) => {
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = Promise.resolve().then(load);
  responseCache.set(key, { promise, expiresAt: Date.now() + CACHE_TTL_MS });
  promise.catch(() => responseCache.delete(key));
  return promise;
};

const tokenize = (value) =>
  normalize(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

const getLanguageConfig = (key) => LANGUAGE_DEFINITIONS.find((language) => language.key === key) || LANGUAGE_DEFINITIONS[0];

const inferLanguageFromQuery = (query) => {
  const raw = String(query || '');
  const normalizedQuery = normalize(raw);
  if (!normalizedQuery) return 'all';

  const scriptMatch = SCRIPT_RULES.find((rule) => rule.pattern.test(raw));
  if (scriptMatch) return scriptMatch.key;

  const keywordMatch = Object.entries(LANGUAGE_KEYWORDS).find(([, keywords]) =>
    keywords.some((keyword) => normalizedQuery.includes(keyword))
  );

  if (keywordMatch) return keywordMatch[0];
  return 'all';
};

export const inferLanguageKey = (song) => {
  const text = [song?.title, song?.artist, song?.collectionName, song?.language]
    .map((value) => String(value || ''))
    .join(' ');
  const normalizedText = normalize(text);

  const scriptMatch = SCRIPT_RULES.find((rule) => rule.pattern.test(text));
  if (scriptMatch) return scriptMatch.key;

  const keywordMatch = Object.entries(LANGUAGE_KEYWORDS).find(([, keywords]) =>
    keywords.some((keyword) => normalizedText.includes(keyword))
  );

  if (keywordMatch) return keywordMatch[0];
  return 'english';
};

const withRegionalLanguage = (song) => {
  const languageKey = inferLanguageKey(song);
  const config = getLanguageConfig(languageKey);
  return {
    ...song,
    language: config.label,
    languageKey,
  };
};

const getPlaybackOptions = (song) => {
  if (!song) return [];
  const options = [
    ...(Array.isArray(song.playbackOptions) ? song.playbackOptions : []),
    { url: song.previewUrl || song.url, source: song.source },
  ];
  const seen = new Set();
  return options.filter((option) => {
    if (!option?.url || seen.has(option.url)) return false;
    seen.add(option.url);
    return true;
  });
};

const dedupeSongs = (songs) => {
  const seen = new Map();
  const result = [];

  songs.forEach((song) => {
    const playbackOptions = getPlaybackOptions(song);
    if (!song?.title || playbackOptions.length === 0) return;

    const titleArtistKey = `${normalize(song.title)}::${normalize(song.artist)}`;
    const key = titleArtistKey !== '::'
      ? titleArtistKey
      : `${normalize(song.source)}::${normalize(playbackOptions[0].url || song.id)}`;

    const existing = seen.get(key);
    if (existing) {
      existing.playbackOptions = getPlaybackOptions({
        ...existing,
        playbackOptions: [...existing.playbackOptions, ...playbackOptions],
      });
      if (!existing.artworkUrl && song.artworkUrl) existing.artworkUrl = song.artworkUrl;
      return;
    }

    const normalizedSong = withRegionalLanguage({
      ...song,
      url: song.url || song.previewUrl || playbackOptions[0].url,
      playbackOptions,
    });
    seen.set(key, normalizedSong);
    result.push(normalizedSong);
  });

  return result;
};

const filterByLanguage = (songs, languageKey) => {
  if (!languageKey || languageKey === 'all') return songs;
  return songs.filter((song) => song.languageKey === languageKey);
};

const scoreSongForQuery = (song, query, languageKey) => {
  const normalizedQuery = normalize(query);
  const title = normalize(song.title);
  const artist = normalize(song.artist);
  const collection = normalize(song.collectionName || song.genre);
  const full = `${title} ${artist} ${collection}`;

  let score = 0;

  if (title === normalizedQuery) score += 250;
  if (title.startsWith(normalizedQuery)) score += 160;
  if (title.includes(normalizedQuery)) score += 120;
  if (artist.includes(normalizedQuery)) score += 110;
  if (full.includes(normalizedQuery)) score += 80;

  const queryTokens = tokenize(normalizedQuery);
  const fieldTokens = tokenize(full);

  queryTokens.forEach((token) => {
    if (fieldTokens.includes(token)) {
      score += 12;
      return;
    }
    if (token.length > 3 && fieldTokens.some((fieldToken) => editDistance(token, fieldToken) === 1)) {
      score += 6;
    }
  });

  if (languageKey && languageKey !== 'all' && song.languageKey === languageKey) {
    score += 70;
  }

  if (song.source === 'audius') score += 8;
  return score;
};

const sortByExactness = (songs, query, languageKey) =>
  [...songs].sort((a, b) => scoreSongForQuery(b, query, languageKey) - scoreSongForQuery(a, query, languageKey));

const prioritizeRegionalSongs = (songs, preferredLanguageKey = 'all') => {
  const regionalOrder = new Map(REGIONAL_PRIORITY_ORDER.map((key, index) => [key, index]));

  const regionalRank = (song) => {
    const key = song?.languageKey || inferLanguageKey(song);
    if (preferredLanguageKey !== 'all' && key === preferredLanguageKey) return 0;
    if (regionalOrder.has(key)) return 1 + regionalOrder.get(key);
    if (key === 'english') return 999;
    return 500;
  };

  return [...songs].sort((a, b) => regionalRank(a) - regionalRank(b));
};

const mergeSongs = (primary, fallback) => {
  return dedupeSongs([...(primary || []), ...(fallback || [])]);
};

const loadProviderWithTimeout = ({ name, load }) => new Promise((resolve, reject) => {
  const timeoutId = setTimeout(
    () => reject(new Error(`${name} catalog request timed out`)),
    PROVIDER_TIMEOUT_MS
  );
  Promise.resolve()
    .then(load)
    .then(
      (tracks) => {
        clearTimeout(timeoutId);
        resolve(tracks);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
});

const collectProviderTracks = async (providers) => {
  const results = await Promise.allSettled(providers.map(loadProviderWithTimeout));
  return results.flatMap((result, index) => {
    if (result.status === 'rejected') {
      console.warn(`${providers[index].name} catalog request failed:`, result.reason);
      return [];
    }
    return Array.isArray(result.value) ? result.value : [];
  });
};

const editDistance = (left, right) => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return previous[right.length];
};

const buildLanguageAwareQuery = (query, languageKey) => {
  if (!query?.trim()) return '';
  const languageConfig = getLanguageConfig(languageKey);
  if (!languageConfig.hint) return query.trim();
  return `${query.trim()} ${languageConfig.hint}`;
};

export const fetchRecommendedSongs = (genre = '', mood = '', languageKey = 'all') => withCache(
  `recommendations:${normalize(genre)}:${normalize(mood)}:${languageKey}`,
  async () => {
  const query = [genre, mood].filter(Boolean).join(' ');
  const tracks = await collectProviderTracks([
    {
      name: 'Audius',
      load: () => query
        ? searchAudiusSongs(query, SOURCE_LIMITS.recommended.audius)
        : fetchAudiusRecommended(SOURCE_LIMITS.recommended.audius),
    },
    {
      name: 'Jamendo',
      load: () => query
        ? searchJamendoSongs(query, SOURCE_LIMITS.recommended.jamendo)
        : fetchJamendoRecommended(SOURCE_LIMITS.recommended.jamendo),
    },
    {
      name: 'Deezer',
      load: () => query
        ? searchDeezer(query, SOURCE_LIMITS.recommended.deezer)
        : getDeezerTopTracks(SOURCE_LIMITS.recommended.deezer),
    },
  ]);

  const merged = mergeSongs(tracks, []);
  const filtered = filterByLanguage(merged, languageKey);

  if (languageKey !== 'all') return prioritizeRegionalSongs(filtered, languageKey).slice(0, MAX_RESULTS);
  return prioritizeRegionalSongs(filtered, languageKey).slice(0, MAX_RESULTS);
  }
);

export const searchSongs = (query, genre = '', mood = '', languageKey = 'all') => withCache(
  `search:${normalize(query)}:${normalize(genre)}:${normalize(mood)}:${languageKey}`,
  async () => {
  if (!query?.trim()) return fetchRecommendedSongs('', '', languageKey);

  const tunedQuery = buildLanguageAwareQuery([query, genre, mood].filter(Boolean).join(' '), languageKey);

  const tracks = await collectProviderTracks([
    {
      name: 'Audius',
      load: () => searchAudiusSongs(tunedQuery, SOURCE_LIMITS.search.audius),
    },
    {
      name: 'Jamendo',
      load: () => searchJamendoSongs(tunedQuery, SOURCE_LIMITS.search.jamendo),
    },
    {
      name: 'Deezer',
      load: () => searchDeezer(tunedQuery, SOURCE_LIMITS.search.deezer),
    },
  ]);

  const merged = mergeSongs(tracks, []);
  const filtered = filterByLanguage(merged, languageKey);
  const searchBase = languageKey !== 'all' ? filtered : merged;
  const inferredLanguageKey = languageKey !== 'all' ? languageKey : inferLanguageFromQuery(query);
  const ranked = sortByExactness(searchBase, query, inferredLanguageKey);
  const regionPreferred = prioritizeRegionalSongs(ranked, inferredLanguageKey);

  return regionPreferred.slice(0, MAX_RESULTS);
  }
);

const sharedTokenCount = (a, b) => {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  let count = 0;

  aTokens.forEach((token) => {
    if (bTokens.has(token)) count += 1;
  });

  return count;
};

const moodLevel = (mood = '') => {
  const text = normalize(mood);
  if (!text || /^(neutral|vibe|global)$/.test(text)) return null;

  if (/joy|happy|upbeat|bright|energetic|party|dance/.test(text)) return 4;
  if (/calm|chill|soft|mellow|relax|ambient/.test(text)) return 1;
  if (/sad|melancholy|emotional|blue|heartbreak/.test(text)) return 0;
  if (/intense|epic|powerful|dramatic/.test(text)) return 5;

  return null;
};

const readStoredArray = (key) => {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch (storageError) {
    console.warn(`Unable to load ${key}`, storageError);
    return [];
  }
};

const relatedScore = (currentSong, candidate, languageKey, favorites, history) => {
  let score = 0;
  const currentGenre = normalize(currentSong.collectionName || currentSong.genre);
  const candidateGenre = normalize(candidate.collectionName || candidate.genre);

  if (normalize(candidate.artist) === normalize(currentSong.artist)) score += 140;
  if (candidate.languageKey === currentSong.languageKey) score += 90;
  if (languageKey !== 'all' && candidate.languageKey === languageKey) score += 60;
  if (currentGenre && candidateGenre && currentGenre === candidateGenre) score += 100;
  if (favorites.some((song) => normalize(song.artist) === normalize(candidate.artist))) score += 50;
  if (favorites.some((song) =>
    normalize(song.collectionName || song.genre) === candidateGenre && candidateGenre
  )) score += 25;

  const recentArtistCount = history
    .filter((song) => normalize(song.artist) === normalize(candidate.artist))
    .length;
  score -= Math.min(recentArtistCount * 8, 32);

  const currentMood = moodLevel(currentSong.mood);
  const candidateMood = moodLevel(candidate.mood);
  if (currentMood !== null && candidateMood !== null) {
    if (candidateMood === currentMood) {
      score += 120;
    } else {
      score -= Math.abs(candidateMood - currentMood) * 8;
    }
  }

  score += sharedTokenCount(currentSong.title, candidate.title) * 20;
  score += sharedTokenCount(currentSong.collectionName, candidate.collectionName) * 12;

  return score;
};

export const getRelatedQueue = (currentSong, songs, languageKey = 'all', preferences = {}) => {
  if (!currentSong || !Array.isArray(songs) || songs.length === 0) return [];

  const favorites = preferences.favorites || readStoredArray('signify_favorites');
  const history = preferences.history || readStoredArray('signify_recently_played');
  const skipped = new Set(readStoredArray('signify_skipped_tracks'));

  return songs
    .filter((song) => song.id !== currentSong.id && !skipped.has(song.id))
    .map((song) => ({ song, score: relatedScore(currentSong, song, languageKey, favorites, history) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.song);
};
