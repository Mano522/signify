/**
 * Preference and Session Service
 * Tracks user likes, skips, listening history, and session-played tracks.
 */

import { getFavorites } from './playlistService.js';

const SKIPPED_TRACKS_KEY = 'signify_skipped_tracks';
const SKIPPED_ARTISTS_KEY = 'signify_skipped_artists';
const RECENT_HISTORY_KEY = 'signify_recently_played';

// In-memory set of tracks played within this active session (to guarantee no repetition)
const sessionPlayedKeys = new Set();

export const getTrackKey = (song) => {
  if (!song) return '';
  if (song.id && String(song.id).trim()) return String(song.id).trim().toLowerCase();
  const artist = (song.artist || '').trim().toLowerCase();
  const title = (song.title || '').trim().toLowerCase();
  return `${artist}:::${title}`;
};

export const markSessionPlayed = (song) => {
  const key = getTrackKey(song);
  if (key) {
    sessionPlayedKeys.add(key);
  }
};

export const isSessionPlayed = (song) => {
  const key = getTrackKey(song);
  return Boolean(key && sessionPlayedKeys.has(key));
};

export const getSessionPlayedCount = () => sessionPlayedKeys.size;

export const clearSessionHistory = () => {
  sessionPlayedKeys.clear();
};

export const getSkippedData = () => {
  try {
    const rawTracks = localStorage.getItem(SKIPPED_TRACKS_KEY);
    const rawArtists = localStorage.getItem(SKIPPED_ARTISTS_KEY);
    return {
      tracks: rawTracks ? JSON.parse(rawTracks) : {},
      artists: rawArtists ? JSON.parse(rawArtists) : {},
    };
  } catch {
    return { tracks: {}, artists: {} };
  }
};

export const recordSkip = (song) => {
  if (!song) return;
  const key = getTrackKey(song);
  const artist = (song.artist || '').trim().toLowerCase();
  const { tracks, artists } = getSkippedData();

  if (key) {
    tracks[key] = (tracks[key] || 0) + 1;
  }
  if (artist) {
    artists[artist] = (artists[artist] || 0) + 1;
  }

  try {
    localStorage.setItem(SKIPPED_TRACKS_KEY, JSON.stringify(tracks));
    localStorage.setItem(SKIPPED_ARTISTS_KEY, JSON.stringify(artists));
  } catch (err) {
    console.warn('Unable to persist skip data', err);
  }
};

export const getListeningHistory = () => {
  try {
    const raw = localStorage.getItem(RECENT_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const recordListeningHistory = (song) => {
  if (!song) return;
  markSessionPlayed(song);
  try {
    const history = getListeningHistory();
    const key = getTrackKey(song);
    const filtered = history.filter((item) => getTrackKey(item) !== key);
    const updated = [
      {
        id: song.id,
        title: song.title,
        artist: song.artist,
        artworkUrl: song.artworkUrl,
        url: song.url,
        playedAt: Date.now(),
      },
      ...filtered,
    ].slice(0, 60);
    localStorage.setItem(RECENT_HISTORY_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Unable to persist history', err);
  }
};

export const getLikedArtistsSet = () => {
  const favorites = getFavorites();
  const artists = new Set();
  favorites.forEach((fav) => {
    if (fav.artist) {
      artists.add(fav.artist.trim().toLowerCase());
    }
  });
  return artists;
};

export const getLikedTrackKeysSet = () => {
  const favorites = getFavorites();
  const set = new Set();
  favorites.forEach((fav) => {
    set.add(getTrackKey(fav));
  });
  return set;
};
