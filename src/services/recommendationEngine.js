/**
 * Client-Side Recommendation Engine
 * - Builds candidate pool from Last.fm track.getSimilar + tag.getTopTracks (selected mood) + iTunes & Deezer
 * - Scores each candidate: similarity + mood match + liked boost - skipped penalty + slight randomness
 * - Guarantees NO repeat songs within a session (sessionPlayed filter)
 * - Maintains 15 tracks in the recommendation queue, refilling in background
 */

import { getSimilarTracks, getTracksByMood, getMoodConfig } from './lastfmService.js';
import { enrichTrack, searchITunesSongs } from './catalogService.js';
import { searchDeezer } from './deezerService.js';
import {
  isSessionPlayed,
  getTrackKey,
  getSkippedData,
  getListeningHistory,
  getLikedArtistsSet,
  getLikedTrackKeysSet,
} from './preferenceService.js';

export const QUEUE_TARGET_SIZE = 15;

/**
 * Score an individual track candidate
 */
export const scoreCandidate = (
  candidate,
  context = {
    seedSong: null,
    moodId: null,
    likedArtists: new Set(),
    likedTrackKeys: new Set(),
    skippedTracks: {},
    skippedArtists: {},
    recentHistoryKeys: new Set(),
  }
) => {
  let score = 0;

  // 1. Base similarity score (0 to 50 pts)
  const similarityMatch = typeof candidate.match === 'number' ? candidate.match : 0.5;
  score += Math.max(0, Math.min(1, similarityMatch)) * 50;

  // 2. Mood match boost (+30 pts)
  if (context.moodId) {
    const candidateMood = (candidate.mood || candidate.moodTag || '').toLowerCase();
    const targetMood = context.moodId.toLowerCase();
    const config = getMoodConfig(targetMood);
    const matchesTag = config && config.tags.some((tag) => candidateMood.includes(tag));
    if (candidateMood === targetMood || matchesTag) {
      score += 30;
    }
  }

  // 3. Boost for liked artist (+25 pts) and liked track (+40 pts)
  const artistName = (candidate.artist || '').trim().toLowerCase();
  const trackKey = getTrackKey(candidate);

  if (artistName && context.likedArtists.has(artistName)) {
    score += 25;
  }
  if (trackKey && context.likedTrackKeys.has(trackKey)) {
    score += 40;
  }

  // 4. Penalty for skipped tracks / artists
  const trackSkipCount = context.skippedTracks[trackKey] || 0;
  const artistSkipCount = context.skippedArtists[artistName] || 0;
  const totalSkipPenalty = Math.min((trackSkipCount * 30) + (artistSkipCount * 15), 65);
  score -= totalSkipPenalty;

  // 5. Slight penalty for songs in recent listening history (-15 pts) to keep queue fresh
  if (trackKey && context.recentHistoryKeys.has(trackKey)) {
    score -= 15;
  }

  // 6. Slight randomness for variety (+/- 8 pts)
  const jitter = (Math.random() - 0.5) * 16;
  score += jitter;

  return score;
};

/**
 * Generate and score candidates, returning top 15 tracks
 */
export const generateRecommendations = async ({
  seedSong = null,
  moodId = null,
  existingQueue = [],
  excludeKeys = new Set(),
  limit = QUEUE_TARGET_SIZE,
}) => {
  const likedArtists = getLikedArtistsSet();
  const likedTrackKeys = getLikedTrackKeysSet();
  const { tracks: skippedTracks, artists: skippedArtists } = getSkippedData();
  const recentHistory = getListeningHistory();
  const recentHistoryKeys = new Set(recentHistory.map((h) => getTrackKey(h)));

  const context = {
    seedSong,
    moodId,
    likedArtists,
    likedTrackKeys,
    skippedTracks,
    skippedArtists,
    recentHistoryKeys,
  };

  const candidatePool = [];
  const candidateKeys = new Set();

  const addCandidate = (song, extra = {}) => {
    if (!song || !song.title || !song.artist) return;
    const key = getTrackKey(song);
    // Never repeat a song played within current session
    if (isSessionPlayed(song)) return;
    // Don't add if excluded or already in candidate pool
    if (excludeKeys.has(key) || candidateKeys.has(key)) return;

    candidateKeys.add(key);
    candidatePool.push({
      ...song,
      ...extra,
    });
  };

  // 1. Fetch similar tracks to seed song (Last.fm track.getSimilar)
  if (seedSong?.artist && seedSong?.title) {
    try {
      const similar = await getSimilarTracks(seedSong.artist, seedSong.title, 30);
      similar.forEach((track) => addCandidate(track, { match: track.match || 0.7 }));
    } catch (err) {
      console.warn('Recommendation: error fetching similar tracks', err);
    }
  }

  // 2. Fetch mood top tracks (Last.fm tag.getTopTracks)
  if (moodId) {
    try {
      const moodTracks = await getTracksByMood(moodId, 30);
      moodTracks.forEach((track) => addCandidate(track, { mood: moodId, match: track.match || 0.6 }));
    } catch (err) {
      console.warn('Recommendation: error fetching mood tracks', err);
    }
  }

  // 3. If pool is small, supplement with iTunes / Deezer
  if (candidatePool.length < limit) {
    try {
      const query = seedSong?.artist || moodId || 'top hits';
      const itunesTracks = await searchITunesSongs(query, 15);
      itunesTracks.forEach((track) => addCandidate(track, { match: 0.5 }));
    } catch (err) {
      console.warn('Recommendation: error fetching fallback tracks', err);
    }
  }

  // Score each candidate
  const scored = candidatePool.map((candidate) => ({
    ...candidate,
    score: scoreCandidate(candidate, context),
  }));

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  // Take the top candidates needed
  const selected = scored.slice(0, limit);

  // Background enrich top items missing artwork
  selected.forEach(async (track) => {
    if (!track.artworkUrl || !track.previewUrl) {
      try {
        const enriched = await enrichTrack(track.artist, track.title);
        if (enriched) {
          if (!track.artworkUrl && enriched.artworkUrl) track.artworkUrl = enriched.artworkUrl;
          if (!track.previewUrl && enriched.previewUrl) {
            track.previewUrl = enriched.previewUrl;
            if (!track.url) track.url = enriched.previewUrl;
          }
        }
      } catch {
        // Safe ignore
      }
    }
  });

  return selected;
};

/**
 * Ensures the queue stays filled up to QUEUE_TARGET_SIZE (15 tracks)
 */
export const refillQueueIfNeeded = async (currentQueue, seedSong, moodId) => {
  const needed = QUEUE_TARGET_SIZE - (currentQueue ? currentQueue.length : 0);
  if (needed <= 0) return currentQueue;

  const existingKeys = new Set((currentQueue || []).map((t) => getTrackKey(t)));
  if (seedSong) existingKeys.add(getTrackKey(seedSong));

  const newTracks = await generateRecommendations({
    seedSong,
    moodId,
    existingQueue: currentQueue,
    excludeKeys: existingKeys,
    limit: needed,
  });

  return [...(currentQueue || []), ...newTracks];
};
