const toSong = (track) => {
  return {
    id: String(track.id),
    title: track.name || track.title || 'Unknown Title',
    artist: track.artist_name || track.artist || 'Unknown Artist',
    artworkUrl: track.album_image || track.artwork || track.image || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300',
    url: track.audio || '',
    duration: Number(track.duration || 0),
    mood: 'neutral',
    languageKey: 'english',
    collectionName: track.musicinfo?.tags?.genres?.[0] || track.album || '',
    source: (track.provider || 'Jamendo').toLowerCase(),
  };
};

const fetchTracks = async (path) => {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Jamendo API request failed: ${response.status}`);
  }

  const tracks = await response.json();
  if (!Array.isArray(tracks)) {
    throw new Error('Jamendo API returned an invalid track list');
  }

  return tracks.map(toSong);
};

export const fetchRecommendedSongs = async (limit = 25) => {
  const params = new URLSearchParams({ limit: String(limit) });
  return fetchTracks(`/api/music/recommendations?${params}`);
};

export const searchSongs = async (query, limit = 25) => {
  if (!query?.trim()) return fetchRecommendedSongs(limit);
  const params = new URLSearchParams({
    q: query.trim(),
    limit: String(limit),
  });
  return fetchTracks(`/api/music/search?${params}`);
};
