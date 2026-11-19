/**
 * Cache Service with 24-hour expiration for API responses
 * Saves catalog responses to reduce repeat network requests.
 */

const CACHE_PREFIX = 'signify_cache_';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const cleanExpiredCache = () => {
  try {
    const now = Date.now();
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        try {
          const item = JSON.parse(localStorage.getItem(key));
          if (item && item.expiresAt && now > item.expiresAt) {
            keysToRemove.push(key);
          }
        } catch {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (err) {
    console.warn('Cache cleanup error:', err);
  }
};

export const getCached = (key) => {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (!record || !record.expiresAt) return null;
    if (Date.now() > record.expiresAt) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return record.data;
  } catch {
    return null;
  }
};

export const setCached = (key, data, ttlMs = DEFAULT_TTL_MS) => {
  try {
    const record = {
      data,
      expiresAt: Date.now() + ttlMs,
      savedAt: Date.now(),
    };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(record));
  } catch {
    // If quota exceeded, clean up old expired items and retry
    cleanExpiredCache();
    try {
      const record = {
        data,
        expiresAt: Date.now() + ttlMs,
        savedAt: Date.now(),
      };
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(record));
    } catch {
      // Storage truly full, gracefully continue
    }
  }
};

export const clearAllCache = () => {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (err) {
    console.warn('Failed to clear cache:', err);
  }
};
