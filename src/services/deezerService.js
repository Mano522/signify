/**
 * Deezer API Service
 * Integrates Deezer track search, charts, audio previews, and album covers.
 * Provides fallback via Vite proxy, JSONP, and CORS proxy.
 * Caches all responses with 24-hour expiration.
 */

import { getCached, setCached } from './cacheService.js';

let jsonpCounter = 0;

const fetchDeezerJsonp = (endpoint, params = {}) => {
  return new Promise((resolve) => {
    const callbackName = `deezer_jsonp_${Date.now()}_${++jsonpCounter}`;
    const query = new URLSearchParams({
      ...params,
      output: 'jsonp',
      callback: callbackName,
    });
    const script = document.createElement('script');
    script.src = `https://api.deezer.com/${endpoint}?${query.toString()}`;

    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 6000);

    const cleanup = () => {
      clearTimeout(timer);
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
    };

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      resolve(null);
    };

    document.head.appendChild(script);
  });
};

const fetchDeezerApi = async (endpoint, params = {}) => {
  const query = new URLSearchParams(params).toString();
  const cacheKey = `deezer_${endpoint}_${query}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // 1. Try local Vite proxy first: /api/deezer/...
  try {
    const proxyUrl = `/api/deezer/${endpoint}${query ? `?${query}` : ''}`;
    const res = await fetch(proxyUrl, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      if (data && !data.error) {
        setCached(cacheKey, data);
        return data;
      }
    }
  } catch {
    // Proxy not available or failed, try next
  }

  // 2. Try Deezer JSONP
  try {
    const jsonpData = await fetchDeezerJsonp(endpoint, params);
    if (jsonpData && !jsonpData.error) {
      setCached(cacheKey, jsonpData);
      return jsonpData;
    }
  } catch {
    // JSONP failed, try CORS proxy
  }

  // 3. Fallback to public CORS proxy
  try {
    const targetUrl = `https://api.deezer.com/${endpoint}${query ? `?${query}` : ''}`;
    const corsUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    const res = await fetch(corsUrl);
    if (res.ok) {
      const data = await res.json();
      if (data && !data.error) {
        setCached(cacheKey, data);
        return data;
      }
    }
  } catch (err) {
    console.warn('Deezer API fallback error:', err);
  }

  return null;
};

/**
 * Format a Deezer API track into Signify's standard song model
 */
export const formatDeezerTrack = (track) => {
  if (!track) return null;
  return {
    id: `dz_${track.id}`,
    deezerId: track.id,
    title: track.title || track.title_short || 'Unknown Title',
    artist: track.artist?.name || 'Unknown Artist',
    album: track.album?.title || '',
    artworkUrl: track.album?.cover_big || track.album?.cover_medium || track.artist?.picture_medium || '',
    duration: track.duration || 0,
    previewUrl: track.preview || '',
    url: track.preview || '', // direct playable preview
    link: track.link || '',
    source: 'deezer',
  };
};

/**
 * Search Deezer catalog
 */
export const searchDeezer = async (query, limit = 25) => {
  if (!query || !query.trim()) return [];
  const clean = query.trim();
  const data = await fetchDeezerApi('search', { q: clean, limit: String(limit) });
  if (data && Array.isArray(data.data)) {
    return data.data.map(formatDeezerTrack).filter(Boolean);
  }
  return [];
};

/**
 * Get Deezer Top Chart tracks
 */
export const getDeezerTopTracks = async (limit = 30) => {
  const data = await fetchDeezerApi('chart/0/tracks', { limit: String(limit) });
  if (data && Array.isArray(data.data)) {
    return data.data.map(formatDeezerTrack).filter(Boolean);
  }
  return [];
};

/**
 * Enrich a song (e.g. from Last.fm) with high-res Deezer artwork & 30s preview
 */
export const enrichWithDeezer = async (artist, title) => {
  if (!artist && !title) return null;
  const q = `${artist || ''} ${title || ''}`.trim();
  const cacheKey = `dz_enrich_${encodeURIComponent(q.toLowerCase())}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const results = await searchDeezer(q, 3);
  if (results && results.length > 0) {
    const bestMatch = results[0];
    setCached(cacheKey, bestMatch);
    return bestMatch;
  }
  return null;
};
