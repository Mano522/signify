const API_BASE = 'https://api-v2.soundcloud.com';

const clientId = import.meta.env.VITE_SOUNDCLOUD_CLIENT_ID;

const hasClientId = () => Boolean(String(clientId || '').trim());

const normalizeArtwork = (artworkUrl) => {
  if (!artworkUrl) return '';
  return String(artworkUrl).replace('-large.', '-t500x500.');
};

const pickBestTranscoding = (transcodings = []) => {
  if (!Array.isArray(transcodings) || transcodings.length === 0) return null;

  const playable = transcodings.filter((entry) =>
    ['hls', 'progressive'].includes(String(entry?.format?.protocol || '').toLowerCase())
  );

  const progressive = playable.find((entry) => String(entry?.format?.protocol || '').toLowerCase() === 'progressive');
  if (progressive) return progressive;

  return playable[0] || null;
};

const resolveStreamUrl = async (transcodingUrl) => {
  if (!transcodingUrl || !hasClientId()) return '';

  try {
    const sep = transcodingUrl.includes('?') ? '&' : '?';
    const res = await fetch(`${transcodingUrl}${sep}client_id=${encodeURIComponent(clientId)}`);
    if (!res.ok) return '';
    const json = await res.json();
    return String(json?.url || '');
  } catch {
    return '';
  }
};

const toSong = async (track, index = 0) => {
  const id = String(track?.id || '');
  if (!id) return null;

  const access = String(track?.access || '').toLowerCase();
  if (access && access !== 'playable') return null;

  const transcoding = pickBestTranscoding(track?.media?.transcodings);
  if (!transcoding?.url) return null;

  const streamUrl = await resolveStreamUrl(transcoding.url);
  if (!streamUrl) return null;

  const title = String(track?.title || `SoundCloud Track ${index + 1}`);
  const artist = String(track?.user?.username || track?.publisher_metadata?.artist || 'SoundCloud Artist');

  return {
    id: `sc_${id}`,
    title,
    artist,
    mood: 'Vibe',
    language: 'Global',
    url: streamUrl,
    duration: Number(track?.duration || 0) / 1000,
    artworkUrl: normalizeArtwork(track?.artwork_url || track?.user?.avatar_url),
    collectionName: String(track?.genre || 'SoundCloud'),
    source: 'soundcloud',
  };
};

const fetchJson = async (path, params = {}) => {
  if (!hasClientId()) return null;

  const searchParams = new URLSearchParams({
    ...params,
    client_id: clientId,
  });

  const res = await fetch(`${API_BASE}${path}?${searchParams.toString()}`);
  if (!res.ok) throw new Error(`SoundCloud request failed: ${res.status}`);
  return res.json();
};

const mapTracks = async (tracks = []) => {
  const resolved = await Promise.all(tracks.map((track, index) => toSong(track, index)));
  return resolved.filter((song) => Boolean(song?.url));
};

export const fetchRecommendedSongs = async () => {
  if (!hasClientId()) return [];

  try {
    const data = await fetchJson('/charts', {
      kind: 'top',
      genre: 'soundcloud:genres:all-music',
      limit: 50,
    });

    const entries = Array.isArray(data?.collection) ? data.collection : [];
    const tracks = entries
      .map((entry) => entry?.track)
      .filter((track) => Boolean(track));

    return mapTracks(tracks);
  } catch (error) {
    console.error('Error fetching SoundCloud recommendations:', error);
    return [];
  }
};

export const searchSongs = async (query) => {
  if (!hasClientId()) return [];
  if (!query?.trim()) return fetchRecommendedSongs();

  try {
    const data = await fetchJson('/search/tracks', {
      q: query.trim(),
      limit: 80,
      access: 'playable',
    });

    const tracks = Array.isArray(data?.collection) ? data.collection : [];
    return mapTracks(tracks);
  } catch (error) {
    console.error('Error searching SoundCloud tracks:', error);
    return [];
  }
};
