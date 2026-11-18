const APP_NAME = 'signify_player';
const API_BOOTSTRAP_URL = 'https://api.audius.co';
const DEFAULT_RECOMMENDED_LIMIT = 240;
const DEFAULT_SEARCH_LIMIT = 300;
const PAGE_SIZE = 100;

let cachedHosts = [];
let currentHostIndex = 0;

const pickArtwork = (artwork) => {
  if (!artwork) return '';
  if (typeof artwork === 'string') return artwork;
  return artwork['480x480'] || artwork['1000x1000'] || artwork['150x150'] || '';
};

const toSong = (track, index = 0) => {
  const title = track?.title || `Track ${index + 1}`;
  const artist = track?.user?.name || track?.user?.handle || 'Unknown Artist';

  return {
    id: String(track?.id || `${title}_${artist}_${index}`),
    title,
    artist,
    mood: 'Vibe',
    language: 'Global',
    url: track?.streamUrl || '',
    duration: Number(track?.duration || 0),
    artworkUrl: pickArtwork(track?.artwork),
    collectionName: track?.genre || '',
    source: 'audius',
  };
};

const getHostsList = async () => {
  if (cachedHosts.length > 0) return cachedHosts;

  try {
    const res = await fetch(API_BOOTSTRAP_URL);
    const json = await res.json();
    const hosts = json?.data;
    if (Array.isArray(hosts) && hosts.length > 0) {
      cachedHosts = hosts;
      currentHostIndex = 0;
      return cachedHosts;
    }
  } catch (err) {
    console.error('Failed to bootstrap Audius hosts:', err);
  }

  // Robust hardcoded fallback servers if the bootstrap endpoint fails
  cachedHosts = [
    'https://audius-discovery-1.cultur3.club',
    'https://discoveryprovider.audius.co',
    'https://audius-metadata-5.figment.io',
    'https://audius-dp.ams.coliving.lol',
    'https://discoveryprovider.mumbaishare.com'
  ];
  currentHostIndex = 0;
  return cachedHosts;
};

const getHost = async () => {
  const hosts = await getHostsList();
  return hosts[currentHostIndex % hosts.length];
};

const rotateHost = () => {
  currentHostIndex++;
};

const fetchJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Audius request failed: ${res.status}`);
  return res.json();
};

const fetchTracks = async (host, endpoint, params = {}) => {
  const urlParams = new URLSearchParams({
    ...params,
    app_name: APP_NAME,
  });
  const url = `${host}${endpoint}?${urlParams.toString()}`;
  const json = await fetchJson(url);
  return Array.isArray(json?.data) ? json.data : [];
};

// Automatic retry helper with dynamic discovery server rotation
const fetchTracksWithRetry = async (endpoint, params = {}, retries = 3) => {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const host = await getHost();
      const tracks = await fetchTracks(host, endpoint, params);
      return tracks;
    } catch (err) {
      console.warn(`Audius fetch failed on attempt ${attempt + 1}. Rotating hosts...`, err);
      rotateHost();
      if (attempt === retries - 1) {
        throw err;
      }
      // Wait briefly with exponential backoff before next retry
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  return [];
};

const normalizeTrackId = (track) => String(track?.id || '');

const dedupeTracks = (tracks) => {
  const seen = new Set();
  const unique = [];

  tracks.forEach((track) => {
    const key = normalizeTrackId(track);
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(track);
  });

  return unique;
};

const fetchTracksByPages = async (endpoint, totalLimit) => {
  const target = Math.max(1, Number(totalLimit || 0));
  const pages = Math.max(1, Math.ceil(target / PAGE_SIZE));
  const requests = [];

  for (let page = 0; page < pages; page += 1) {
    const offset = page * PAGE_SIZE;
    const remaining = target - offset;
    const limit = Math.max(1, Math.min(PAGE_SIZE, remaining));
    requests.push(fetchTracksWithRetry(endpoint, { limit, offset }));
  }

  const chunks = await Promise.all(requests);
  return dedupeTracks(chunks.flat());
};

const withStreamUrl = (host, track) => ({
  ...track,
  streamUrl: `${host}/v1/tracks/${track.id}/stream?app_name=${APP_NAME}`,
});

export const fetchRecommendedSongs = async (limit = DEFAULT_RECOMMENDED_LIMIT) => {
  try {
    const tracks = await fetchTracksByPages('/v1/tracks/trending', limit);
    const host = await getHost();

    return tracks
      .map((track) => withStreamUrl(host, track))
      .map((track, index) => toSong(track, index))
      .filter((song) => Boolean(song.url));
  } catch (error) {
    console.error('Error fetching Audius trending tracks:', error);
    return [];
  }
};

export const searchSongs = async (query, limit = DEFAULT_SEARCH_LIMIT) => {
  if (!query?.trim()) return fetchRecommendedSongs(limit);

  try {
    const target = Math.max(1, Number(limit || 0));
    const pages = Math.max(1, Math.ceil(target / PAGE_SIZE));
    const requests = [];
    const trimmed = query.trim();

    for (let page = 0; page < pages; page += 1) {
      const offset = page * PAGE_SIZE;
      const remaining = target - offset;
      const pageLimit = Math.max(1, Math.min(PAGE_SIZE, remaining));
      requests.push(
        fetchTracksWithRetry('/v1/tracks/search', {
          query: trimmed,
          limit: pageLimit,
          offset,
        })
      );
    }

    const tracks = dedupeTracks((await Promise.all(requests)).flat());
    const host = await getHost();

    return tracks
      .map((track) => withStreamUrl(host, track))
      .map((track, index) => toSong(track, index))
      .filter((song) => Boolean(song.url));
  } catch (error) {
    console.error('Error searching Audius tracks:', error);
    return [];
  }
};
