const CLIENT_ID = '7aaebbab';
const BASE_URL = 'https://api.jamendo.com/v3.0/tracks/';

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

export const fetchRecommendedSongs = async (limit = 25) => {
  try {
    const url = `${BASE_URL}?client_id=${CLIENT_ID}&format=json&limit=${limit}&order=popularity_week&audioformat=mp32`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Jamendo API error: ${res.status}`);
    
    const data = await res.json();
    if (!data.results) return [];
    return data.results.map(toSong);
  } catch (error) {
    console.error('Error fetching Jamendo recommendations:', error);
    return [];
  }
};

export const searchSongs = async (query, limit = 25) => {
  if (!query?.trim()) return fetchRecommendedSongs(limit);
  try {
    const params = new URLSearchParams({ q: query.trim() });
    const response = await fetch(`/api/music/search?${params}`);
    if (!response.ok) throw new Error(`Jamendo search API error: ${response.status}`);

    const tracks = await response.json();
    return Array.isArray(tracks) ? tracks.map(toSong) : [];
  } catch (error) {
    console.error('Error searching Jamendo tracks:', error);
    return [];
  }
};
