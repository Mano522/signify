/**
 * Last.fm API Service
 * Integrates:
 * - track.getSimilar
 * - tag.getTopTracks
 * - artist.getSimilar
 * - track.search
 * With 24-hour caching and mood tag mappings.
 */

import { getCached, setCached } from './cacheService.js';

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';
const API_KEY = import.meta.env.VITE_LASTFM_API_KEY || '';

export const MOODS = [
  { id: 'happy', label: 'Happy', emoji: '☀️', tags: ['happy', 'feel good', 'uplifting', 'pop'] },
  { id: 'sad', label: 'Sad', emoji: '🌧️', tags: ['sad', 'melancholy', 'heartbreak', 'acoustic'] },
  { id: 'chill', label: 'Chill', emoji: '☕', tags: ['chill', 'relax', 'lo-fi', 'ambient'] },
  { id: 'focus', label: 'Focus', emoji: '🎯', tags: ['focus', 'study', 'instrumental', 'ambient'] },
  { id: 'workout', label: 'Workout', emoji: '⚡', tags: ['workout', 'energetic', 'fitness', 'electronic'] },
  { id: 'romantic', label: 'Romantic', emoji: '💖', tags: ['romantic', 'love songs', 'soul', 'rnb'] },
  { id: 'party', label: 'Party', emoji: '🎉', tags: ['party', 'dance', 'club', 'edm'] },
];

export const getMoodConfig = (moodId) => {
  return MOODS.find((m) => m.id.toLowerCase() === (moodId || '').toLowerCase()) || null;
};

// Curated fallbacks in case Last.fm key is missing or rate limited
const CURATED_MOOD_TRACKS = {
  happy: [
    { title: 'Happy', artist: 'Pharrell Williams', mood: 'happy' },
    { title: 'Good as Hell', artist: 'Lizzo', mood: 'happy' },
    { title: "Can't Stop the Feeling!", artist: 'Justin Timberlake', mood: 'happy' },
    { title: 'Uptown Funk', artist: 'Mark Ronson ft. Bruno Mars', mood: 'happy' },
    { title: 'Walking on Sunshine', artist: 'Katrina & The Waves', mood: 'happy' },
    { title: 'Sunday Best', artist: 'Surfaces', mood: 'happy' },
    { title: 'Levitating', artist: 'Dua Lipa', mood: 'happy' },
    { title: 'I Gotta Feeling', artist: 'Black Eyed Peas', mood: 'happy' },
  ],
  sad: [
    { title: 'Someone Like You', artist: 'Adele', mood: 'sad' },
    { title: 'Fix You', artist: 'Coldplay', mood: 'sad' },
    { title: 'Skinny Love', artist: 'Bon Iver', mood: 'sad' },
    { title: 'when the party\'s over', artist: 'Billie Eilish', mood: 'sad' },
    { title: 'All I Want', artist: 'Kodaline', mood: 'sad' },
    { title: 'Say Something', artist: 'A Great Big World', mood: 'sad' },
    { title: 'Drivers License', artist: 'Olivia Rodrigo', mood: 'sad' },
  ],
  chill: [
    { title: 'Weightless', artist: 'Marconi Union', mood: 'chill' },
    { title: 'Sunset Lover', artist: 'Petit Biscuit', mood: 'chill' },
    { title: 'Teardrop', artist: 'Massive Attack', mood: 'chill' },
    { title: 'Midnight City', artist: 'M83', mood: 'chill' },
    { title: 'Cold Little Heart', artist: 'Michael Kiwanuka', mood: 'chill' },
    { title: 'Breathe Me', artist: 'Sia', mood: 'chill' },
  ],
  focus: [
    { title: 'Time', artist: 'Hans Zimmer', mood: 'focus' },
    { title: 'Experience', artist: 'Ludovico Einaudi', mood: 'focus' },
    { title: 'Clair de Lune', artist: 'Claude Debussy', mood: 'focus' },
    { title: 'Intro', artist: 'The xx', mood: 'focus' },
    { title: 'Nuvole Bianche', artist: 'Ludovico Einaudi', mood: 'focus' },
  ],
  workout: [
    { title: 'Stronger', artist: 'Kanye West', mood: 'workout' },
    { title: "'Till I Collapse", artist: 'Eminem', mood: 'workout' },
    { title: 'Eye of the Tiger', artist: 'Survivor', mood: 'workout' },
    { title: 'Power', artist: 'Kanye West', mood: 'workout' },
    { title: 'Levels', artist: 'Avicii', mood: 'workout' },
    { title: 'Believer', artist: 'Imagine Dragons', mood: 'workout' },
  ],
  romantic: [
    { title: 'Perfect', artist: 'Ed Sheeran', mood: 'romantic' },
    { title: 'All of Me', artist: 'John Legend', mood: 'romantic' },
    { title: 'Thinking Out Loud', artist: 'Ed Sheeran', mood: 'romantic' },
    { title: 'Make You Feel My Love', artist: 'Adele', mood: 'romantic' },
    { title: 'Just the Way You Are', artist: 'Bruno Mars', mood: 'romantic' },
  ],
  party: [
    { title: 'Don\'t Start Now', artist: 'Dua Lipa', mood: 'party' },
    { title: 'One More Time', artist: 'Daft Punk', mood: 'party' },
    { title: 'Titanium', artist: 'David Guetta ft. Sia', mood: 'party' },
    { title: 'Hey Ya!', artist: 'Outkast', mood: 'party' },
    { title: '24K Magic', artist: 'Bruno Mars', mood: 'party' },
  ],
};

const extractLastfmImage = (images) => {
  if (!Array.isArray(images) || images.length === 0) return '';
  const preferred = images.find((i) => i.size === 'extralarge' || i.size === 'large');
  return (preferred && preferred['#text']) || images[images.length - 1]?.['#text'] || '';
};

const callLastfm = async (params) => {
  if (!API_KEY) {
    return null;
  }
  const query = new URLSearchParams({
    ...params,
    api_key: API_KEY,
    format: 'json',
  });
  const url = `${LASTFM_BASE}?${query.toString()}`;
  const cacheKey = `lastfm_${params.method}_${params.track || ''}_${params.artist || ''}_${params.tag || ''}_${params.limit || ''}`;

  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`Last.fm API returned ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (data && !data.error) {
      setCached(cacheKey, data);
      return data;
    }
    return null;
  } catch (err) {
    console.warn('Last.fm fetch error:', err);
    return null;
  }
};

/**
 * Get tracks similar to a given song (track.getSimilar)
 */
export const getSimilarTracks = async (artist, track, limit = 25) => {
  if (!artist || !track) return [];
  const data = await callLastfm({
    method: 'track.getsimilar',
    artist,
    track,
    limit: String(limit),
  });

  const rawTracks = data?.similartracks?.track;
  if (!Array.isArray(rawTracks)) return [];

  return rawTracks.map((t) => ({
    id: `lfm_${encodeURIComponent(t.artist?.name || '')}_${encodeURIComponent(t.name || '')}`,
    title: t.name,
    artist: t.artist?.name || 'Unknown Artist',
    match: typeof t.match === 'number' ? t.match : parseFloat(t.match) || 0.5,
    artworkUrl: extractLastfmImage(t.image),
    duration: parseInt(t.duration, 10) || 0,
    source: 'lastfm',
  }));
};

/**
 * Get top tracks for a Last.fm tag (tag.getTopTracks)
 */
export const getTopTracksByTag = async (tag, limit = 40) => {
  if (!tag) return [];
  const data = await callLastfm({
    method: 'tag.gettoptracks',
    tag,
    limit: String(limit),
  });

  const rawTracks = data?.tracks?.track;
  if (!Array.isArray(rawTracks) || rawTracks.length === 0) {
    return [];
  }

  return rawTracks.map((t, idx) => ({
    id: `lfm_tag_${encodeURIComponent(tag)}_${encodeURIComponent(t.artist?.name || '')}_${encodeURIComponent(t.name || '')}`,
    title: t.name,
    artist: t.artist?.name || 'Unknown Artist',
    match: Math.max(0.3, 1 - idx * 0.02),
    artworkUrl: extractLastfmImage(t.image),
    duration: parseInt(t.duration, 10) || 0,
    moodTag: tag,
    source: 'lastfm',
  }));
};

/**
 * Get artists similar to a given artist (artist.getSimilar)
 */
export const getSimilarArtists = async (artist, limit = 15) => {
  if (!artist) return [];
  const data = await callLastfm({
    method: 'artist.getsimilar',
    artist,
    limit: String(limit),
  });

  const rawArtists = data?.similarartists?.artist;
  if (!Array.isArray(rawArtists)) return [];

  return rawArtists.map((a) => ({
    name: a.name,
    match: parseFloat(a.match) || 0.5,
    artworkUrl: extractLastfmImage(a.image),
  }));
};

/**
 * Search tracks by query (track.search)
 */
export const searchTracks = async (query, limit = 30) => {
  if (!query) return [];
  const data = await callLastfm({
    method: 'track.search',
    track: query,
    limit: String(limit),
  });

  const rawTracks = data?.results?.trackmatches?.track;
  if (!Array.isArray(rawTracks)) return [];

  return rawTracks.map((t) => ({
    id: `lfm_search_${encodeURIComponent(t.artist || '')}_${encodeURIComponent(t.name || '')}`,
    title: t.name,
    artist: t.artist || 'Unknown Artist',
    artworkUrl: extractLastfmImage(t.image),
    source: 'lastfm',
  }));
};

/**
 * Get tracks for a mood (combines primary and secondary Last.fm tags with curated fallback)
 */
export const getTracksByMood = async (moodId, limit = 30) => {
  const config = getMoodConfig(moodId);
  const moodKey = (moodId || 'happy').toLowerCase();

  let fetchedTracks = [];
  if (config && config.tags.length > 0) {
    const primaryTag = config.tags[0];
    fetchedTracks = await getTopTracksByTag(primaryTag, limit);

    // If still low count, fetch secondary tag
    if (fetchedTracks.length < limit / 2 && config.tags[1]) {
      const secondary = await getTopTracksByTag(config.tags[1], limit / 2);
      fetchedTracks = [...fetchedTracks, ...secondary];
    }
  }

  // If Last.fm API returned no tracks (e.g. no key or rate limited), use curated mood tracks
  if (fetchedTracks.length === 0) {
    const curated = CURATED_MOOD_TRACKS[moodKey] || CURATED_MOOD_TRACKS.happy;
    return curated.map((item, idx) => ({
      id: `curated_${moodKey}_${idx}`,
      title: item.title,
      artist: item.artist,
      mood: item.mood,
      match: 0.9 - idx * 0.05,
      source: 'curated',
      artworkUrl: '',
    }));
  }

  // Deduplicate by artist + title
  const seen = new Set();
  const unique = [];
  fetchedTracks.forEach((t) => {
    const key = `${t.artist.toLowerCase()}:::${t.title.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push({ ...t, mood: moodKey });
    }
  });

  return unique.slice(0, limit);
};
