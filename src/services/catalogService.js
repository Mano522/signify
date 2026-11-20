import {
  fetchRecommendedSongs as getJamendoRecommendations,
  searchSongs as searchJamendoSongs,
} from './jamendoService.js';
import { getCached, setCached } from './cacheService.js';

const normalize = (value) => String(value || '').trim().toLowerCase();
const isPlayable = (track) => Boolean(track?.url || track?.previewUrl);

export const searchJamendo = async (query) => {
  if (!query?.trim()) return [];
  return searchJamendoSongs(query.trim());
};

export const fetchJamendoRecommendations = async (query = '', limit = 24) => {
  const tracks = query?.trim()
    ? await searchJamendoSongs(query.trim(), limit)
    : await getJamendoRecommendations(limit);
  return tracks.slice(0, limit);
};

export const enrichTrack = async (artist, title) => {
  if (!artist && !title) return null;

  const cacheKey = `jamendo_enrich_${encodeURIComponent(`${artist || ''} ${title || ''}`.trim().toLowerCase())}`;
  const cached = getCached(cacheKey);
  if (isPlayable(cached)) return cached;

  const tracks = await searchJamendo(`${artist || ''} ${title || ''}`);
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
