import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './home.css';

// Services
import { MOODS, getTracksByMood, searchTracks as searchLastfmTracks } from '../../../services/lastfmService.js';
import { searchDeezer, getDeezerTopTracks, enrichWithDeezer } from '../../../services/deezerService.js';
import {
  generateRecommendations,
  refillQueueIfNeeded,
  QUEUE_TARGET_SIZE,
} from '../../../services/recommendationEngine.js';
import {
  recordSkip,
  recordListeningHistory,
  markSessionPlayed,
  isSessionPlayed,
} from '../../../services/preferenceService.js';
import {
  addToPlaylist,
  getFavorites,
  getPlaylists,
  isFavorite,
  toggleFavorite,
} from '../../../services/playlistService.js';

// Components
import Footer from '../Layoutss/footer.jsx';
import Sidebar from '../Sidebar.jsx';
import QueuePanel from '../QueuePanel.jsx';
import YouTubePlayer from '../YouTubePlayer.jsx';

const formatTime = (secs) => {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

export default function Home() {
  const navigate = useNavigate();

  // Search & Query state
  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      const stored = localStorage.getItem('signify_recent_searches');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Mood State
  const [selectedMood, setSelectedMood] = useState('happy');

  // Track Lists & Grid
  const [songs, setSongs] = useState([]);
  const [moodSongs, setMoodSongs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  // Recommendation Queue
  const [queue, setQueue] = useState([]);
  const [isQueueOpen, setIsQueueOpen] = useState(false);

  // Playback State
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [previousVolume, setPreviousVolume] = useState(80);
  const [seekTime, setSeekTime] = useState(null);
  const [activeSource, setActiveSource] = useState('youtube'); // 'youtube' | 'deezer'
  const [isShuffle, setIsShuffle] = useState(false);

  // Toast Notifications
  const [toastMessage, setToastMessage] = useState('');

  // Library & Playlists
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [favorites, setFavorites] = useState(getFavorites);
  const [, refreshLibrary] = useState(0);

  // Refs
  const currentSongRef = useRef(currentSong);
  const queueRef = useRef(queue);
  const selectedMoodRef = useRef(selectedMood);
  const searchRequestRef = useRef(0);
  const songStartedAtRef = useRef(Date.now());

  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { selectedMoodRef.current = selectedMood; }, [selectedMood]);

  // Show temporary toast message
  const showToast = useCallback((msg, durationMs = 3500) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? '' : prev));
    }, durationMs);
  }, []);

  // Save recent searches
  useEffect(() => {
    try {
      localStorage.setItem('signify_recent_searches', JSON.stringify(recentSearches));
    } catch (e) {
      console.warn('Could not save recent searches', e);
    }
  }, [recentSearches]);

  // ── Load Mood Tracks and Initial Queue ──
  const loadMood = useCallback(async (moodId) => {
    setSelectedMood(moodId);
    setLoading(true);
    setError('');

    try {
      // 1. Fetch tracks mapped to this mood from Last.fm
      const tracks = await getTracksByMood(moodId, 24);

      // 2. Supplement with Deezer top tracks if list is short
      let fullTracks = tracks;
      if (fullTracks.length < 12) {
        const dzTracks = await searchDeezer(moodId, 15);
        fullTracks = [...fullTracks, ...dzTracks];
      }

      setMoodSongs(fullTracks);

      // 3. Build initial recommendation queue for this mood
      const initialQueue = await generateRecommendations({
        seedSong: fullTracks[0] || null,
        moodId,
        limit: QUEUE_TARGET_SIZE,
      });
      setQueue(initialQueue);
    } catch (err) {
      console.error('Failed to load mood tracks:', err);
      setError('Could not load mood recommendations. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load default mood on mount
  useEffect(() => {
    loadMood('happy');
  }, [loadMood]);

  // ── Play a selected song ──
  const playSong = useCallback((song) => {
    if (!song) return;

    // Record previously playing song history
    if (currentSongRef.current) {
      recordListeningHistory(currentSongRef.current);
    }

    markSessionPlayed(song);
    songStartedAtRef.current = Date.now();
    setCurrentSong(song);
    setIsPlaying(true);
    setElapsed(0);
    setDuration(song.duration || 0);

    // Refill recommendation queue in the background
    refillQueueIfNeeded(queueRef.current, song, selectedMoodRef.current).then((updated) => {
      setQueue(updated);
    });
  }, []);

  // ── AUTOPLAY: When song ends or skipped ──
  const playNext = useCallback((wasExplicitSkip = false) => {
    const cur = currentSongRef.current;
    if (cur) {
      // If user skipped within 30 seconds, record penalty in preference engine
      const playedSeconds = (Date.now() - songStartedAtRef.current) / 1000;
      if (wasExplicitSkip && playedSeconds < 30) {
        recordSkip(cur);
      }
      recordListeningHistory(cur);
    }

    const currentQ = [...queueRef.current];

    // Filter candidates to ensure NEVER repeating a song within this session
    const unplayedCandidates = currentQ.filter((item) => !isSessionPlayed(item));

    if (unplayedCandidates.length > 0) {
      let nextTrack;
      let nextIndex = 0;

      if (isShuffle) {
        nextIndex = Math.floor(Math.random() * unplayedCandidates.length);
        nextTrack = unplayedCandidates[nextIndex];
      } else {
        nextTrack = unplayedCandidates[0];
      }

      // Remove the selected track from queue
      const updatedQueue = currentQ.filter((item) => item !== nextTrack);
      setQueue(updatedQueue);

      playSong(nextTrack);

      // Refill queue in background if dropping low
      if (updatedQueue.length < 8) {
        refillQueueIfNeeded(updatedQueue, nextTrack, selectedMoodRef.current).then((refilled) => {
          setQueue(refilled);
        });
      }
    } else {
      // If queue is completely exhausted, generate fresh batch
      showToast('Generating fresh recommendations for you...');
      generateRecommendations({
        seedSong: cur,
        moodId: selectedMoodRef.current,
        limit: QUEUE_TARGET_SIZE,
      }).then((freshQueue) => {
        if (freshQueue.length > 0) {
          const next = freshQueue[0];
          setQueue(freshQueue.slice(1));
          playSong(next);
        } else {
          showToast('End of session queue.');
        }
      });
    }
  }, [isShuffle, playSong, showToast]);

  const playPrev = useCallback(() => {
    const history = JSON.parse(localStorage.getItem('signify_recently_played') || '[]');
    if (history.length > 1) {
      // Second item is previous
      const prev = history[1];
      if (prev) {
        playSong(prev);
      }
    } else {
      setSeekTime(0);
      setElapsed(0);
    }
  }, [playSong]);

  const togglePlayPause = useCallback(() => {
    if (!currentSong) {
      // If nothing loaded yet, play first mood song
      if (moodSongs.length > 0) {
        playSong(moodSongs[0]);
      }
      return;
    }
    setIsPlaying((prev) => !prev);
  }, [currentSong, moodSongs, playSong]);

  // ── "Radio from this song" ──
  const startRadioFromSong = useCallback((seedTrack) => {
    if (!seedTrack) return;
    showToast(`📻 Starting radio based on "${seedTrack.title}"...`);
    playSong(seedTrack);

    // Build new radio queue
    generateRecommendations({
      seedSong: seedTrack,
      moodId: selectedMoodRef.current,
      limit: QUEUE_TARGET_SIZE,
    }).then((radioQueue) => {
      setQueue(radioQueue);
    });
  }, [playSong, showToast]);

  // ── Search handler ──
  const handleSearch = async (overrideQuery) => {
    const q = typeof overrideQuery === 'string' ? overrideQuery : query;
    if (!q || !q.trim()) return;
    const cleanQ = q.trim();

    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setHasSearched(true);
    setLoading(true);
    setError('');

    if (typeof overrideQuery === 'string') {
      setQuery(cleanQ);
    }

    setRecentSearches((prev) => {
      const filtered = prev.filter((s) => s.toLowerCase() !== cleanQ.toLowerCase());
      return [cleanQ, ...filtered].slice(0, 6);
    });

    try {
      // Search Deezer & Last.fm concurrently
      const [dzResults, lfmResults] = await Promise.all([
        searchDeezer(cleanQ, 15),
        searchLastfmTracks(cleanQ, 15),
      ]);

      if (requestId !== searchRequestRef.current) return;

      // Merge results deduplicating by normalized title + artist
      const seen = new Set();
      const merged = [];

      dzResults.forEach((t) => {
        const key = `${t.artist.toLowerCase()}:::${t.title.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(t);
        }
      });

      lfmResults.forEach((t) => {
        const key = `${t.artist.toLowerCase()}:::${t.title.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(t);
        }
      });

      setSongs(merged);
      if (merged.length === 0) {
        setError(`No playable tracks found for "${cleanQ}".`);
      }
    } catch (err) {
      if (requestId === searchRequestRef.current) {
        console.error('Search error:', err);
        setError('Search is temporarily unavailable. Please try again.');
      }
    } finally {
      if (requestId === searchRequestRef.current) {
        setLoading(false);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleGlobalKey = (e) => {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName))
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        playNext(true);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        playPrev();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setVolume((v) => {
          if (v > 0) {
            setPreviousVolume(v);
            return 0;
          }
          return previousVolume || 80;
        });
      }
    };

    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [togglePlayPause, playNext, playPrev, previousVolume]);

  // ── Seek ──
  const handleSeekChange = (e) => {
    const val = parseFloat(e.target.value);
    setElapsed(val);
  };

  const handleSeekCommit = (e) => {
    const val = parseFloat(e.target.value);
    setSeekTime(val);
  };

  // ── Favorites & Playlists ──
  const handleFavoriteClick = (e, song) => {
    e.stopPropagation();
    const added = toggleFavorite(song);
    setFavorites(getFavorites());
    refreshLibrary((v) => v + 1);
    showToast(added ? `❤️ Added "${song.title}" to Favorites` : `Removed "${song.title}" from Favorites`);
  };

  const handleAddToPlaylist = (e, song) => {
    e.stopPropagation();
    const playlistId = e.target.value;
    if (!playlistId) return;
    addToPlaylist(playlistId, song);
    refreshLibrary((v) => v + 1);
    showToast(`Added to playlist`);
    e.target.value = '';
  };

  const playlists = getPlaylists();

  // ── Render a Song Card ──
  const renderSongCard = (song, idx) => {
    const isCurrent = currentSong?.title === song.title && currentSong?.artist === song.artist;
    const isFav = isFavorite(song.id || `${song.artist}_${song.title}`);

    return (
      <div
        key={`${song.id || song.title}_${idx}`}
        className={`song-card ${isCurrent ? 'active' : ''}`}
        onClick={() => playSong(song)}
      >
        <div className="song-thumb-wrap">
          {song.artworkUrl ? (
            <img src={song.artworkUrl} alt={song.title} className="song-thumb" loading="lazy" />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', background: 'rgba(124, 58, 237, 0.15)' }}>
              🎵
            </div>
          )}
          <div className="card-play-overlay">
            <div className="play-circle">
              {isCurrent && isPlaying ? '⏸' : '▶'}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#1F2937' }}>
            {song.title}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {song.artist}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              className="control-btn"
              style={{ fontSize: '1.1rem', padding: 4 }}
              title={isFav ? 'Remove from favorites' : 'Add to favorites'}
              onClick={(e) => handleFavoriteClick(e, song)}
            >
              {isFav ? '❤️' : '♡'}
            </button>
            <button
              type="button"
              className="control-btn"
              style={{ fontSize: '1rem', padding: 4 }}
              title="Radio from this song"
              onClick={(e) => {
                e.stopPropagation();
                startRadioFromSong(song);
              }}
            >
              📻
            </button>
          </div>

          {playlists.length > 0 && (
            <select
              aria-label={`Add to playlist`}
              defaultValue=""
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => handleAddToPlaylist(e, song)}
              style={{
                fontSize: '0.75rem',
                borderRadius: 14,
                padding: '3px 8px',
                border: '1px solid rgba(124, 58, 237, 0.3)',
                background: 'rgba(255, 255, 255, 0.7)',
                color: '#4B5563',
                cursor: 'pointer',
              }}
            >
              <option value="">＋ Playlist</option>
              {playlists.map((pl) => (
                <option key={pl.id} value={pl.id}>{pl.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="home-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="notification-toast">
          <span>🔔</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <header className="home-header">
        <h1 className="logo-small" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          Signify
        </h1>

        <div className="header-actions">
          <button
            type="button"
            className="chip"
            onClick={() => setLibraryOpen(true)}
            title="Open Favorites & Playlists"
          >
            📚 My Library
          </button>
          <button
            type="button"
            className={`chip ${isQueueOpen ? 'active' : ''}`}
            onClick={() => setIsQueueOpen((prev) => !prev)}
            title="Toggle Up Next Queue"
          >
            📑 Up Next ({queue.length})
          </button>
        </div>

        {/* Search Bar */}
        <div className="search-bar glass">
          <input
            type="text"
            placeholder="Search for songs, artists, or albums…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button onClick={() => handleSearch()} disabled={loading}>
            {loading ? '…' : 'Search'}
          </button>
        </div>

        {/* Recent Searches */}
        {recentSearches.length > 0 && (
          <div className="recent-searches-container">
            {recentSearches.map((s, idx) => (
              <span key={idx} className="recent-search-pill" onClick={() => handleSearch(s)}>
                {s}
                <span
                  className="delete-recent-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRecentSearches((prev) => prev.filter((item) => item !== s));
                  }}
                  title="Remove search"
                >
                  ✕
                </span>
              </span>
            ))}
          </div>
        )}
      </header>

      {/* Mood Buttons Selector */}
      <div className="mood-container">
        <span className="mood-title">Browse By Mood & Vibes</span>
        <div className="mood-bar">
          {MOODS.map((m) => {
            const isActive = selectedMood === m.id;
            return (
              <button
                key={m.id}
                type="button"
                className={`mood-chip ${isActive ? 'active' : ''}`}
                onClick={() => loadMood(m.id)}
              >
                <span>{m.emoji}</span>
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#DC2626', padding: '10px 20px', borderRadius: 16, marginBottom: '1.5rem', fontWeight: 500 }}>
          {error}
        </div>
      )}

      {/* Loading Spinner */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '2rem 0' }}>
          <div className="loader" />
        </div>
      )}

      {/* Search Results */}
      {hasSearched && songs.length > 0 && (
        <>
          <div className="section-title" style={{ width: '100%', maxWidth: 1050 }}>
            <span>Search Results for "{query}"</span>
            <span style={{ fontSize: '0.9rem', color: '#6B7280', fontWeight: 400 }}>{songs.length} tracks</span>
          </div>
          <div className="song-grid">
            {songs.map((song, i) => renderSongCard(song, i))}
          </div>
        </>
      )}

      {/* Mood Recommendations */}
      {moodSongs.length > 0 && (
        <>
          <div className="section-title" style={{ width: '100%', maxWidth: 1050 }}>
            <span>{MOODS.find((m) => m.id === selectedMood)?.emoji} {MOODS.find((m) => m.id === selectedMood)?.label} Vibes</span>
            <span style={{ fontSize: '0.9rem', color: '#6B7280', fontWeight: 400 }}>Handpicked & AI-Ranked</span>
          </div>
          <div className="song-grid">
            {moodSongs.map((song, i) => renderSongCard(song, i))}
          </div>
        </>
      )}

      {/* Spacer so floating player never covers content */}
      <div style={{ height: 130 }} />

      {/* Audio Coordinator: YouTube IFrame + Deezer Fallback */}
      <YouTubePlayer
        currentSong={currentSong}
        isPlaying={isPlaying}
        volume={volume}
        seekTime={seekTime}
        onTimeUpdate={(t) => setElapsed(t)}
        onDurationChange={(d) => setDuration(d)}
        onEnded={() => playNext(false)}
        onError={(msg) => showToast(msg)}
        onSourceChange={(src) => setActiveSource(src)}
      />

      {/* Floating Bottom Player Bar */}
      {currentSong && (
        <div className="music-player glass">
          <div className="player-inner">

            {/* Current Song Details */}
            <div className="player-track-info">
              {currentSong.artworkUrl ? (
                <img src={currentSong.artworkUrl} alt="" className="player-thumb" />
              ) : (
                <div className="player-thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(124, 58, 237, 0.2)', fontSize: '1.5rem' }}>
                  🎵
                </div>
              )}
              <div className="player-titles">
                <span className="player-title">{currentSong.title}</span>
                <span className="player-artist">{currentSong.artist}</span>
                <span className={`source-badge ${activeSource === 'youtube' ? 'badge-youtube' : 'badge-deezer'}`}>
                  {activeSource === 'youtube' ? '▶ YouTube Stream' : '🎵 Deezer Preview'}
                </span>
              </div>
              <button
                type="button"
                className="control-btn"
                style={{ marginLeft: 4 }}
                title={isFavorite(currentSong.id || `${currentSong.artist}_${currentSong.title}`) ? 'Remove from favorites' : 'Add to favorites'}
                onClick={(e) => handleFavoriteClick(e, currentSong)}
              >
                {isFavorite(currentSong.id || `${currentSong.artist}_${currentSong.title}`) ? '❤️' : '♡'}
              </button>
            </div>

            {/* Playback Controls */}
            <div className="player-controls">
              <button
                type="button"
                className="control-btn"
                style={{ color: isShuffle ? '#7C3AED' : '#9CA3AF' }}
                onClick={() => {
                  setIsShuffle((prev) => !prev);
                  showToast(!isShuffle ? '🔀 Shuffle enabled' : 'Shuffle disabled');
                }}
                title="Toggle Shuffle"
              >
                🔀
              </button>
              <button type="button" className="control-btn" onClick={playPrev} title="Previous (ArrowLeft)">
                ⏮
              </button>
              <button
                type="button"
                className="control-btn play-pause"
                onClick={togglePlayPause}
                title="Play / Pause (Space)"
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button
                type="button"
                className="control-btn"
                onClick={() => playNext(true)}
                title="Next (ArrowRight)"
              >
                ⏭
              </button>
              <button
                type="button"
                className="control-btn"
                onClick={() => startRadioFromSong(currentSong)}
                title="Radio from this song"
              >
                📻
              </button>
            </div>

            {/* Seek Slider */}
            <div className="player-seek-wrap">
              <span className="seek-time">{formatTime(elapsed)}</span>
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.5}
                value={elapsed}
                onChange={handleSeekChange}
                onMouseUp={handleSeekCommit}
                onTouchEnd={handleSeekCommit}
                className="seek-slider"
                title="Seek"
              />
              <span className="seek-time">{formatTime(duration)}</span>
            </div>

            {/* Volume & Queue Drawer Toggle */}
            <div className="player-extra-actions">
              <span
                style={{ cursor: 'pointer', fontSize: '1rem' }}
                title="Mute/Unmute (M)"
                onClick={() => {
                  setVolume((v) => {
                    if (v > 0) {
                      setPreviousVolume(v);
                      return 0;
                    }
                    return previousVolume || 80;
                  });
                }}
              >
                {volume === 0 ? '🔇' : volume < 50 ? '🔉' : '🔊'}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={volume}
                onChange={(e) => setVolume(parseInt(e.target.value, 10))}
                className="volume-slider"
                title="Volume"
              />
              <button
                type="button"
                className="queue-toggle-btn"
                onClick={() => setIsQueueOpen((prev) => !prev)}
                title="Up Next Queue"
              >
                <span>📑</span>
                <span className="queue-count-badge">{queue.length}</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Up Next Queue Drawer */}
      <QueuePanel
        isOpen={isQueueOpen}
        onClose={() => setIsQueueOpen(false)}
        currentSong={currentSong}
        queue={queue}
        onReorderQueue={(newQueue) => setQueue(newQueue)}
        onPlayQueueItem={(song, index) => {
          const updated = queue.filter((_, idx) => idx !== index);
          setQueue(updated);
          playSong(song);
        }}
        onRemoveFromQueue={(index) => {
          setQueue((prev) => prev.filter((_, idx) => idx !== index));
        }}
        onStartRadio={(seedTrack) => {
          startRadioFromSong(seedTrack);
        }}
      />

      {/* My Library Sidebar */}
      <Sidebar
        isOpen={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        currentSong={currentSong}
        onPlaySong={(song) => {
          playSong(song);
          setLibraryOpen(false);
        }}
        onLibraryChange={() => refreshLibrary((v) => v + 1)}
      />

      {/* Signify Footer */}
      <Footer />
    </div>
  );
}
