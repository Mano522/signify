import {
  fetchRecommendedSongs as fetchProviderRecommendations,
  searchSongs as searchProviderSongs,
} from './multiSourceMusicService.js';
import { getCached, setCached } from './cacheService.js';

const normalize = (value) => String(value || '').trim().toLowerCase();
const isPlayable = (track) => Boolean(track?.url || track?.previewUrl);

export const searchUniversal = async (query) => {
  if (!query?.trim()) return [];
  return searchProviderSongs(query.trim());
};

export const fetchCatalogRecommendations = async (moodId = '', limit = 24) => {
  const tracks = await fetchProviderRecommendations('', moodId, 'all');
  return tracks.slice(0, limit);
};

export const enrichTrack = async (artist, title) => {
  if (!artist && !title) return null;

  const cacheKey = `provider_enrich_${encodeURIComponent(`${artist || ''} ${title || ''}`.trim().toLowerCase())}`;
  const cached = getCached(cacheKey);
  if (isPlayable(cached)) return cached;

  const tracks = await searchUniversal(`${artist || ''} ${title || ''}`);
  const matchingTrack = tracks.find(
    (track) =>
      normalize(track.title) === normalize(title) &&
      normalize(track.artist) === normalize(artist) &&
      isPlayable(track)
  );

  if (!matchingTrack) return null;
  setCached(cacheKey, matchingTrack);
  return matchingTrack;
};
