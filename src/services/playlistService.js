// ─── Favorites ────────────────────────────────────────────────────────────────

const FAVORITES_KEY = 'signify_favorites';
const PLAYLISTS_KEY = 'signify_playlists';

const buildStableSongId = (song = {}) => {
  if (song.id && String(song.id).trim()) return String(song.id).trim();

  const parts = [song.title, song.artist, song.url]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  if (parts.length > 0) return `song_${parts.join('_')}`;
  return `song_${Date.now()}`;
};

const normalizeSong = (song = {}) => {
  return { ...song, id: buildStableSongId(song) };
};

const normalizePlaylist = (playlist = {}, index = 0) => {
  const songs = Array.isArray(playlist.songs) ? playlist.songs : [];
  return {
    ...playlist,
    id: playlist.id || `pl_${Date.now()}_${index}`,
    name: playlist.name || `Playlist ${index + 1}`,
    songs: songs.map(normalizeSong),
  };
};

const dedupeSongsById = (songs = []) => {
  const seen = new Set();
  const unique = [];

  songs.forEach((song) => {
    const normalized = normalizeSong(song);
    if (!seen.has(normalized.id)) {
      seen.add(normalized.id);
      unique.push(normalized);
    }
  });

  return unique;
};

export const getFavorites = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
    if (!Array.isArray(raw)) return [];
    return dedupeSongsById(raw);
  } catch {
    return [];
  }
};

export const isFavorite = (songId) => {
  return getFavorites().some((s) => s.id === String(songId));
};

export const toggleFavorite = (song) => {
  const normalizedSong = normalizeSong(song);
  const favorites = getFavorites();
  const exists = favorites.some((s) => s.id === normalizedSong.id);
  const updated = exists
    ? favorites.filter((s) => s.id !== normalizedSong.id)
    : [...favorites, normalizedSong];
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
  return !exists; // returns true if song was ADDED
};

// ─── Playlists ─────────────────────────────────────────────────────────────────

export const getPlaylists = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(PLAYLISTS_KEY)) || [];
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizePlaylist);
  } catch {
    return [];
  }
};

export const createPlaylist = (name) => {
  const playlists = getPlaylists();
  const newPlaylist = {
    id: `pl_${Date.now()}`,
    name,
    songs: [],
    createdAt: new Date().toISOString(),
  };
  const updated = [...playlists, newPlaylist];
  localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(updated));
  return newPlaylist;
};

export const deletePlaylist = (playlistId) => {
  const updated = getPlaylists().filter((p) => p.id !== playlistId);
  localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(updated));
};

export const addToPlaylist = (playlistId, song) => {
  const normalizedSong = normalizeSong(song);
  const playlists = getPlaylists();
  const updated = playlists.map((pl) => {
    if (pl.id !== playlistId) return pl;
    const alreadyIn = pl.songs.some((s) => s.id === normalizedSong.id);
    if (alreadyIn) return pl;
    return { ...pl, songs: [...pl.songs, normalizedSong] };
  });
  localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(updated));
};

export const removeFromPlaylist = (playlistId, songId) => {
  const playlists = getPlaylists();
  const updated = playlists.map((pl) => {
    if (pl.id !== playlistId) return pl;
    return { ...pl, songs: pl.songs.filter((s) => s.id !== songId) };
  });
  localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(updated));
};
