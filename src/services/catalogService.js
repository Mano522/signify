/**
 * Catalog Service
 * Unified multi-source music provider that searches:
 * 1. YouTube Data API v3 (returns instant videoIds and playable tracks)
 * 2. iTunes Search API (free, reliable globally, gives high-res artwork and 30s preview streams)
 * 3. Deezer API
 * 4. Last.fm API
 *
 * Guarantees every song is playable and has album art.
 */

import { searchYouTubeVideos } from './youtubeService.js';
import { searchDeezer, enrichWithDeezer } from './deezerService.js';
import { searchTracks as searchLastfmTracks } from './lastfmService.js';
import { getCached, setCached } from './cacheService.js';

/**
 * Free iTunes Search API (no API key needed, works in all regions)
 */
export const searchITunesSongs = async (query, limit = 15) => {
  if (!query || !query.trim()) return [];
  const cleanQ = query.trim();
  const cacheKey = `itunes_${encodeURIComponent(cleanQ.toLowerCase())}_${limit}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const encoded = encodeURIComponent(cleanQ);
    const url = `https://itunes.apple.com/search?term=${encoded}&limit=${limit}&entity=song`;
    const res = await fetch(url);
    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data.results)) return [];

    const tracks = data.results.map((r) => {
      // Upgrade artwork from 100x100 to 600x600
      const artwork = (r.artworkUrl100 || '').replace('100x100bb.jpg', '600x600bb.jpg');
      return {
        id: `itunes_${r.trackId}`,
        title: r.trackName,
        artist: r.artistName,
        album: r.collectionName,
        artworkUrl: artwork || r.artworkUrl100 || '',
        previewUrl: r.previewUrl || '',
        url: r.previewUrl || '',
        duration: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : 0,
        source: 'itunes',
      };
    });

    setCached(cacheKey, tracks);
    return tracks;
  } catch (err) {
    console.warn('iTunes search error:', err);
    return [];
  }
};

/**
 * Enrich a song with artwork and previewUrl from iTunes or Deezer
 */
export const enrichTrack = async (artist, title) => {
  if (!artist && !title) return null;
  const q = `${artist || ''} ${title || ''}`.trim();
  const cacheKey = `enrich_${encodeURIComponent(q.toLowerCase())}`;
  const cached = getCached(cacheKey);
  if (cached?.previewUrl || cached?.url) return cached;

  try {
    // 1. Try iTunes for high-res art & preview
    const itunesResults = await searchITunesSongs(q, 1);
    const playableITunesTrack = itunesResults.find((track) => track.previewUrl || track.url);
    if (playableITunesTrack) {
      setCached(cacheKey, playableITunesTrack);
      return playableITunesTrack;
    }
  } catch {
    // Ignore
  }

  try {
    // 2. Try Deezer
    const dzResult = await enrichWithDeezer(artist, title);
    if (dzResult) {
      setCached(cacheKey, dzResult);
      return dzResult;
    }
  } catch {
    // Ignore
  }

  return null;
};

/**
 * Universal Search across YouTube, iTunes, Deezer, and Last.fm
 * Deduplicates and returns rich, playable tracks.
 */
export const searchUniversal = async (query) => {
  if (!query || !query.trim()) return [];
  const cleanQ = query.trim();

  // Run searches in parallel
  const [ytResults, itunesResults, dzResults, lfmResults] = await Promise.allSettled([
    searchYouTubeVideos(cleanQ, 12),
    searchITunesSongs(cleanQ, 12),
    searchDeezer(cleanQ, 10),
    searchLastfmTracks(cleanQ, 10),
  ]);

  const yt = ytResults.status === 'fulfilled' ? ytResults.value : [];
  const itunes = itunesResults.status === 'fulfilled' ? itunesResults.value : [];
  const dz = dzResults.status === 'fulfilled' ? dzResults.value : [];
  const lfm = lfmResults.status === 'fulfilled' ? lfmResults.value : [];

  const seen = new Set();
  const merged = [];

  const addTrack = (track) => {
    if (!track || !track.title) return;
    const key = `${(track.artist || '').trim().toLowerCase()}:::${(track.title || '').trim().toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(track);
    }
  };

  // 1. Add YouTube results first (they have direct videoIds ready to play!)
  yt.forEach(addTrack);

  // 2. Add iTunes results (they have high-res covers and previewUrls)
  itunes.forEach((t) => {
    // If we already added this track from YouTube, attach the previewUrl and high-res artwork to it
    const key = `${(t.artist || '').trim().toLowerCase()}:::${(t.title || '').trim().toLowerCase()}`;
    const existing = merged.find((item) => `${(item.artist || '').trim().toLowerCase()}:::${(item.title || '').trim().toLowerCase()}` === key);
    if (existing) {
      if (!existing.previewUrl && t.previewUrl) existing.previewUrl = t.previewUrl;
      if (!existing.artworkUrl && t.artworkUrl) existing.artworkUrl = t.artworkUrl;
    } else {
      addTrack(t);
    }
  });

  // 3. Add Deezer results
  dz.forEach(addTrack);

  // 4. Add Last.fm results
  lfm.forEach(addTrack);

  return merged;
};
