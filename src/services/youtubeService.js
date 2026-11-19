/**
 * YouTube Service
 * Handles:
 * - Direct YouTube video search (returns real tracks with videoId & thumbnails)
 * - Just-in-time video ID resolution with 24-hour cache
 * - Error detection (quotaExceeded, network errors)
 * - YouTube IFrame Player API script loader
 */

import { getCached, setCached } from './cacheService.js';

const YOUTUBE_SEARCH_BASE = 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY || '';

let isQuotaExceeded = false;
let iframeApiPromise = null;

export const checkIsYouTubeQuotaExceeded = () => isQuotaExceeded;

/**
 * Loads the YouTube IFrame Player API script once
 */
export const loadYouTubeIframeApi = () => {
  if (iframeApiPromise) return iframeApiPromise;

  iframeApiPromise = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }

    const prevOnReady = window.onYouTubeIframeAPIReady;
    const script = document.getElementById('youtube-iframe-api');
    const apiScript = script || document.createElement('script');
    let timeoutId;
    const cleanup = () => {
      clearTimeout(timeoutId);
      apiScript.onerror = null;
    };

    window.onYouTubeIframeAPIReady = () => {
      cleanup();
      if (typeof prevOnReady === 'function') prevOnReady();
      if (window.YT?.Player) {
        resolve(window.YT);
      } else {
        reject(new Error('YouTube IFrame API loaded without a player.'));
      }
    };

    if (!script) {
      apiScript.id = 'youtube-iframe-api';
      apiScript.src = 'https://www.youtube.com/iframe_api';
      apiScript.async = true;
    }

    apiScript.onerror = () => {
      cleanup();
      reject(new Error('Unable to load the YouTube IFrame API.'));
    };
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out loading the YouTube IFrame API.'));
    }, 15000);

    if (!script) document.body.appendChild(apiScript);
  });

  return iframeApiPromise;
};

/**
 * Search YouTube Data API for tracks (returns videoId, title, artist, thumbnail)
 */
export const searchYouTubeVideos = async (query, maxResults = 15) => {
  if (!query || !query.trim() || !YOUTUBE_API_KEY || isQuotaExceeded) return [];

  const cleanQ = query.trim();
  const cacheKey = `yt_search_${encodeURIComponent(cleanQ.toLowerCase())}_${maxResults}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      videoEmbeddable: 'true',
      maxResults: String(maxResults),
      q: `${cleanQ} song`,
      key: YOUTUBE_API_KEY,
    });

    const res = await fetch(`${YOUTUBE_SEARCH_BASE}?${params.toString()}`);

    if (res.status === 403) {
      isQuotaExceeded = true;
      return [];
    }

    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data.items)) return [];

    const tracks = data.items.map((item) => {
      const vid = item.id?.videoId;
      const rawTitle = item.snippet?.title || '';
      let artist = item.snippet?.channelTitle || 'Unknown Artist';
      let title = rawTitle;

      if (rawTitle.includes('-')) {
        const parts = rawTitle.split('-');
        artist = parts[0].trim();
        title = parts.slice(1).join('-').trim();
      }

      // Clean up common video title artifacts
      title = title.replace(/\(Official Video.*?\)|\[Official Video.*?\]|\(Official Audio.*?\)|\[Official Audio.*?\]|\(Lyrics.*?\)|\[Lyrics.*?\]/gi, '').trim() || rawTitle;

      return {
        id: `yt_${vid}`,
        videoId: vid,
        title,
        artist,
        artworkUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || '',
        channelTitle: item.snippet?.channelTitle,
        source: 'youtube',
      };
    }).filter((t) => Boolean(t.videoId));

    setCached(cacheKey, tracks);
    return tracks;
  } catch (err) {
    console.warn('YouTube search failed:', err);
    return [];
  }
};

/**
 * Resolves a YouTube video ID JUST-IN-TIME (only when about to play)
 * Checks 24-hour cache first.
 */
export const resolveYouTubeVideoId = async (artist, title) => {
  if (!artist && !title) return null;

  const cleanArtist = (artist || '').trim();
  const cleanTitle = (title || '').replace(/\(.*\)|\[.*\]/g, '').trim();
  const cacheKey = `yt_vid_${encodeURIComponent(cleanArtist.toLowerCase())}_${encodeURIComponent(cleanTitle.toLowerCase())}`;

  // Check 24-hour cache
  const cachedVid = getCached(cacheKey);
  if (cachedVid) {
    return cachedVid;
  }

  // If quota was already hit this session or no key, return null
  if (isQuotaExceeded || !YOUTUBE_API_KEY) {
    return null;
  }

  try {
    const query = `${cleanArtist} - ${cleanTitle} audio`;
    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      videoEmbeddable: 'true',
      maxResults: '1',
      q: query,
      key: YOUTUBE_API_KEY,
    });

    const res = await fetch(`${YOUTUBE_SEARCH_BASE}?${params.toString()}`);

    if (res.status === 403) {
      const errData = await res.json().catch(() => ({}));
      const reason = errData?.error?.errors?.[0]?.reason;
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
        isQuotaExceeded = true;
        console.warn('YouTube Data API quota exceeded. Falling back to audio preview.');
      }
      return null;
    }

    if (!res.ok) {
      console.warn(`YouTube search returned HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const firstItem = data?.items?.[0];
    const videoId = firstItem?.id?.videoId;

    if (videoId) {
      setCached(cacheKey, videoId);
      return videoId;
    }
  } catch (err) {
    console.warn('Failed to resolve YouTube video ID:', err);
  }

  return null;
};
