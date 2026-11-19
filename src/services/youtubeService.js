/**
 * YouTube Service
 * Handles:
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

  iframeApiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }

    const prevOnReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevOnReady === 'function') prevOnReady();
      resolve(window.YT);
    };

    // If script already inserted, wait for callback
    const existing = document.getElementById('youtube-iframe-api');
    if (!existing) {
      const script = document.createElement('script');
      script.id = 'youtube-iframe-api';
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.body.appendChild(script);
    }
  });

  return iframeApiPromise;
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
    const query = `${cleanArtist} - ${cleanTitle} official audio`;
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
        console.warn('YouTube Data API quota exceeded. Falling back to Deezer preview audio.');
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
