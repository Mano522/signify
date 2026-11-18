import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './home.css';
import {
  fetchRecommendedSongs as fetchCatalogRecommendations,
  getRelatedQueue,
  searchSongs as searchCatalogSongs,
} from '../../../services/multiSourceMusicService.js';
import Footer from '../Layoutss/footer.jsx';
import Sidebar from '../Sidebar.jsx';
import {
  addToPlaylist,
  getFavorites,
  getPlaylists,
  isFavorite,
  toggleFavorite,
} from '../../../services/playlistService.js';

const formatTime = (secs) => {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const inferMoodFromQuery = (q) => {
  const text = String(q || '').toLowerCase();
  if (!text) return 'neutral';

  if (/(happy|joy|excited|party|energetic|upbeat|festive)/.test(text)) return 'party';
  if (/(sad|blue|alone|heartbroken|melancholy|cry)/.test(text)) return 'emotional';
  if (/(calm|chill|relax|smooth|gentle)/.test(text)) return 'chill';
  if (/(angry|intense|dark|heavy|punchy)/.test(text)) return 'intense';
  if (/(romantic|love|soft|soulful)/.test(text)) return 'emotional';

  return 'neutral';
};

export default function Home() {
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      const stored = localStorage.getItem('signify_recent_searches');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [songs, setSongs] = useState([]);
  const [recommendedSongs, setRecommendedSongs] = useState([]);
  const [recommendedLoading, setRecommendedLoading] = useState(true);
  const [recommendedError, setRecommendedError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const [currentSong, setCurrentSong] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isShuffle, setIsShuffle] = useState(false);
  const [userRequestedPlay, setUserRequestedPlay] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [favorites, setFavorites] = useState(getFavorites);
  const [, refreshLibrary] = useState(0);

  const audioRef = useRef(null);
  const userRequestedPlayRef = useRef(false);
  const songsRef = useRef(songs);
  const currentIndexRef = useRef(currentIndex);
  const volumeRef = useRef(volume);
  const recommendedSongsRef = useRef(recommendedSongs);
  const currentSongRef = useRef(currentSong);
  const playedHistoryRef = useRef(new Set());
  const searchRequestRef = useRef(0);

  const playNext = useCallback((wasSkipped = false) => {
    if (!songsRef.current.length) return;
    if (wasSkipped && currentSongRef.current) {
      try {
        const storedSkipped = JSON.parse(localStorage.getItem('signify_skipped_tracks') || '[]');
        const skipped = Array.isArray(storedSkipped) ? storedSkipped : [];
        localStorage.setItem(
          'signify_skipped_tracks',
          JSON.stringify([
            currentSongRef.current.id,
            ...skipped.filter((id) => id !== currentSongRef.current.id),
          ].slice(0, 50))
        );
      } catch (storageError) {
        console.warn('Unable to save skipped track', storageError);
      }
    }

    if (currentSongRef.current && recommendedSongsRef.current.length > 0) {
      const related = getRelatedQueue(currentSongRef.current, recommendedSongsRef.current, currentSongRef.current.languageKey || 'all');
      const unplayedRelated = related.filter((song) => !playedHistoryRef.current.has(song.id));
      if (unplayedRelated.length > 0) {
        const nextRelated = isShuffle
          ? unplayedRelated[Math.floor(Math.random() * unplayedRelated.length)]
          : unplayedRelated[0];
        setUserRequestedPlay(true);
        userRequestedPlayRef.current = true;
        const nextQueue = [nextRelated, ...unplayedRelated.filter((song) => song.id !== nextRelated.id)];
        setSongs(nextQueue);
        setCurrentIndex(0);
        setCurrentSong(nextRelated);
        setElapsed(0);
        return;
      }
    }

    let skippedIds = [];
    try {
      const skipped = JSON.parse(localStorage.getItem('signify_skipped_tracks') || '[]');
      if (Array.isArray(skipped)) skippedIds = skipped;
    } catch (storageError) {
      console.warn('Unable to load skipped tracks', storageError);
    }
    const makeCandidates = (excludePlayed) => songsRef.current
      .map((song, index) => ({ song, index }))
      .filter(({ song, index }) => (
        index !== currentIndexRef.current
        && !skippedIds.includes(song.id)
        && (!excludePlayed || !playedHistoryRef.current.has(song.id))
      ));
    const candidates = makeCandidates(true);
    const fallbackCandidates = candidates.length ? candidates : makeCandidates(false);
    if (!fallbackCandidates.length) return;
    let nextCandidate;
    if (isShuffle) {
      nextCandidate = fallbackCandidates[Math.floor(Math.random() * fallbackCandidates.length)];
    } else {
      const queueLength = songsRef.current.length;
      const currentIndex = currentIndexRef.current;
      nextCandidate = fallbackCandidates
        .map((candidate) => ({
          ...candidate,
          distance: (candidate.index - currentIndex + queueLength) % queueLength,
        }))
        .sort((a, b) => a.distance - b.distance)[0];
    }

    setUserRequestedPlay(true);
    userRequestedPlayRef.current = true;
    setElapsed(0);
    setCurrentIndex(nextCandidate.index);
    setCurrentSong(nextCandidate.song);
  }, [isShuffle]);

  const playPrev = useCallback(() => {
    if (!songsRef.current.length) return;
    const prev = (currentIndexRef.current - 1 + songsRef.current.length) % songsRef.current.length;
    setUserRequestedPlay(true);
    userRequestedPlayRef.current = true;
    setElapsed(0);
    setCurrentIndex(prev);
    setCurrentSong(songsRef.current[prev]);
  }, []);

  useEffect(() => { songsRef.current = songs; }, [songs]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { userRequestedPlayRef.current = userRequestedPlay; }, [userRequestedPlay]);
  useEffect(() => {
    recommendedSongsRef.current = recommendedSongs;
  }, [recommendedSongs]);
  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);

  useEffect(() => {
    try {
      const history = JSON.parse(localStorage.getItem('signify_recently_played') || '[]');
      if (Array.isArray(history)) {
        history.forEach((song) => {
          if (song?.id) playedHistoryRef.current.add(song.id);
        });
      }
    } catch (storageError) {
      console.warn('Unable to load listening history', storageError);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('signify_recent_searches', JSON.stringify(recentSearches));
    } catch (storageError) {
      console.warn('Unable to save recent searches', storageError);
    }
  }, [recentSearches]);

  useEffect(() => {
    if (!currentSong) return undefined;
    playedHistoryRef.current.add(currentSong.id);
    try {
      const history = JSON.parse(localStorage.getItem('signify_recently_played') || '[]');
      const updatedHistory = [
        currentSong,
        ...history.filter((song) => song.id !== currentSong.id),
      ].slice(0, 50);
      localStorage.setItem('signify_recently_played', JSON.stringify(updatedHistory));
    } catch (storageError) {
      console.warn('Unable to save listening history', storageError);
    }

    let active = true;
    const fetchMoreRelated = async () => {
      try {
        const mood = /^(neutral|vibe|global)$/i.test(currentSong.mood || '') ? '' : currentSong.mood;
        const results = await searchCatalogSongs(
          currentSong.artist,
          currentSong.collectionName || '',
          mood || ''
        );
        if (!active || results.length === 0) return;
        setRecommendedSongs((previous) => {
          const knownIds = new Set(previous.map((song) => song.id));
          return [
            ...previous,
            ...results.filter((song) => !knownIds.has(song.id) && song.id !== currentSong.id),
          ].slice(0, 100);
        });
      } catch (catalogError) {
        console.error('Unable to refresh related tracks', catalogError);
      }
    };

    fetchMoreRelated();
    return () => { active = false; };
  }, [currentSong]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (!currentSong) return;
    if (!currentSong.url) {
      setPlaying(false);
      setError('This catalog track does not provide a playable stream.');
      return;
    }

    setError('');
    audio.src = currentSong.url;
    audio.volume = volumeRef.current / 100;
    if (userRequestedPlayRef.current) {
      audio.play()
        .then(() => {
          setUserRequestedPlay(false);
          userRequestedPlayRef.current = false;
        })
        .catch((playError) => {
          setPlaying(false);
          setError(`Unable to play this track: ${playError.message}`);
        });
    }
  }, [currentSong]);

  useEffect(() => {
    let active = true;
    const loadRecommended = async () => {
      try {
        setRecommendedLoading(true);
        setRecommendedError('');
        const recommendations = await fetchCatalogRecommendations();
        if (!active) return;
        setRecommendedSongs(recommendations);
        if (!recommendations.length) {
          setRecommendedError('No playable tracks are available right now. Try again in a moment.');
        }
      } catch (recommendationError) {
        if (active) {
          console.error('Unable to load recommendations', recommendationError);
          setRecommendedError('Recommendations are temporarily unavailable.');
        }
      } finally {
        if (active) setRecommendedLoading(false);
      }
    };
    loadRecommended();
    return () => { active = false; };
  }, []);

  // ── Volume sync ──
  useEffect(() => {
    volumeRef.current = volume;
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
  }, [volume]);

  // ── Search ──
  const handleSearch = async (overrideQuery) => {
    const q = typeof overrideQuery === 'string' ? overrideQuery : query;
    if (!q.trim()) return;
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setHasSearched(true);

    if (typeof overrideQuery === 'string') {
      setQuery(q);
    }

    setRecentSearches((prev) => {
      const filtered = prev.filter((s) => s.toLowerCase() !== q.trim().toLowerCase());
      return [q.trim(), ...filtered].slice(0, 5);
    });

    setLoading(true);
    setError('');

    try {
      const mood = inferMoodFromQuery(q);
      const results = await searchCatalogSongs(q.trim(), '', mood === 'neutral' ? '' : mood);
      if (requestId !== searchRequestRef.current) return;
      setSongs(results);
      if (results.length === 0) setError(`No playable tracks found for "${q.trim()}".`);
    } catch (searchError) {
      if (requestId === searchRequestRef.current) {
        console.error('Music search failed', searchError);
        setError('Search is temporarily unavailable. Please try again.');
      }
    } finally {
      if (requestId === searchRequestRef.current) setLoading(false);
    }
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSearch(); };

  // ── Playback controls ──
  const playSong = (song, index, playlist = songs) => {
    if (currentSong?.id === song.id) {
      togglePlayPause();
      return;
    }

    // Mark that the new song start was initiated by user interaction.
    setUserRequestedPlay(true);
    userRequestedPlayRef.current = true;

    setElapsed(0);
    setDuration(0);
    setSongs(playlist);
    setCurrentIndex(index);
    setCurrentSong(song);
  };

  const togglePlayPause = useCallback(() => {
    if (!currentSong) return;
    if (!audioRef.current || !currentSong.url) {
      setError('This track is not available for playback.');
      return;
    }

    if (playing) {
      audioRef.current.pause();
    } else {
      setUserRequestedPlay(true);
      userRequestedPlayRef.current = true;
      audioRef.current.play().then(() => {
        setUserRequestedPlay(false);
        userRequestedPlayRef.current = false;
      }).catch((playError) => {
        setPlaying(false);
        setError(`Unable to play this track: ${playError.message}`);
      });
    }
  }, [currentSong, playing]);

  const relatedSongs = useMemo(() => {
    if (!currentSong || !recommendedSongs?.length) return [];
    return getRelatedQueue(currentSong, recommendedSongs, 'all', { favorites }).slice(0, 8);
  }, [currentSong, recommendedSongs, favorites]);
  const playlists = getPlaylists();

  const playRelatedQueue = () => {
    if (!relatedSongs.length) return;
    setUserRequestedPlay(true);
    userRequestedPlayRef.current = true;
    setSongs(relatedSongs);
    setCurrentIndex(0);
    setCurrentSong(relatedSongs[0]);
    setElapsed(0);
  };

  const handleSeek = (e) => {
    const val = parseFloat(e.target.value);
    setElapsed(val);
    if (audioRef.current) audioRef.current.currentTime = val;
  };

  const handleFavorite = (event, song) => {
    event.stopPropagation();
    toggleFavorite(song);
    setFavorites(getFavorites());
    refreshLibrary((version) => version + 1);
  };

  const handleAddToPlaylist = (event, song) => {
    event.stopPropagation();
    const playlistId = event.target.value;
    if (!playlistId) return;
    addToPlaylist(playlistId, song);
    refreshLibrary((version) => version + 1);
    event.target.value = '';
  };

  const renderSongCard = (song, index, playlist) => (
    <div
      key={song.id}
      className={`song-card${currentSong?.id === song.id ? ' active' : ''}`}
      onClick={() => playSong(song, index, playlist)}
    >
      {song.artworkUrl && (
        <img
          src={song.artworkUrl}
          alt={song.title}
          loading="lazy"
          style={{ width: '100%', borderRadius: 12, marginBottom: '0.75rem', objectFit: 'cover', aspectRatio: '16/9' }}
        />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {song.title || 'Unknown Title'}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {song.artist}
          </p>
        </div>
        <span style={{ fontSize: '1.4rem', marginLeft: 8 }}>
          {currentSong?.id === song.id && playing ? '⏸' : '▶'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          className="control-btn"
          aria-label={isFavorite(song.id) ? 'Remove from favorites' : 'Add to favorites'}
          title={isFavorite(song.id) ? 'Remove from favorites' : 'Add to favorites'}
          onClick={(event) => handleFavorite(event, song)}
        >
          {isFavorite(song.id) ? '♥' : '♡'}
        </button>
        {playlists.length > 0 && (
          <select
            aria-label={`Add ${song.title} to playlist`}
            defaultValue=""
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => handleAddToPlaylist(event, song)}
            style={{ maxWidth: '100%', borderRadius: 16, padding: '4px 8px' }}
          >
            <option value="">＋ Playlist</option>
            {playlists.map((playlistItem) => (
              <option key={playlistItem.id} value={playlistItem.id}>{playlistItem.name}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );

  useEffect(() => {
    const handlePlaybackShortcut = (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && (
        target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)
      )) return;
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlayPause();
      } else if (event.code === 'ArrowRight') {
        playNext(true);
      } else if (event.code === 'ArrowLeft') {
        playPrev();
      }
    };
    window.addEventListener('keydown', handlePlaybackShortcut);
    return () => window.removeEventListener('keydown', handlePlaybackShortcut);
  }, [playNext, playPrev, togglePlayPause]);

  return (
    <div className="home-container">

      {/* Header */}
      <header className="home-header">
        <h1 className="logo-small" onClick={() => navigate('/')} style={{ cursor: 'pointer', margin: '0 0 1rem 0' }}>
          Signify
        </h1>
        <button
          type="button"
          className="chip"
          onClick={() => setLibraryOpen(true)}
          style={{ marginBottom: 12 }}
        >
          My Library
        </button>
        <div className="search-bar glass">
          <input
            type="text"
            placeholder="Search for songs, artists…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button onClick={handleSearch} disabled={loading}>
            {loading ? '…' : 'Search'}
          </button>
        </div>
        {recentSearches.length > 0 && (
          <div className="recent-searches-container">
            {recentSearches.map((s, idx) => (
              <span key={idx} className="recent-search-pill" onClick={() => handleSearch(s)}>
                {s}
                <span
                  className="delete-recent-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRecentSearches(prev => prev.filter(search => search !== s));
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

      {error && <p style={{ color: '#EF4444', marginBottom: '1rem' }}>{error}</p>}

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '2rem 0' }}>
          <div className="loader" />
        </div>
      )}

      {hasSearched && !loading && songs.length === 0 && !error && (
        <p style={{ color: '#6B7280', marginBottom: '1rem' }}>No songs loaded yet. Try a search or refresh.</p>
      )}

      {/* Song Grid */}
      {hasSearched && songs.length > 0 && (
        <>
          <h2 className="section-title" style={{ width: '100%', maxWidth: 1000, marginBottom: '1.5rem' }}>
            Results
          </h2>
          <div className="song-grid">
            {songs.map((song, i) => renderSongCard(song, i, songs))}
          </div>
        </>
      )}

      {recommendedLoading && <p style={{ color: '#6B7280' }}>Loading recommendations…</p>}
      {recommendedError && <p style={{ color: '#EF4444' }}>{recommendedError}</p>}

      {recommendedSongs.length > 0 && (
        <>
          <h2 className="section-title" style={{ width: '100%', maxWidth: 1000, marginBottom: '1.5rem' }}>
            Recommended for you
          </h2>
          <div className="song-grid">
            {recommendedSongs.slice(0, 12).map((song, i) => (
              renderSongCard(song, i, recommendedSongs)
            ))}
          </div>
        </>
      )}

      {currentSong && relatedSongs.length > 0 && (
        <>
          <h2 className="section-title" style={{ width: '100%', maxWidth: 1000, marginBottom: '1.5rem' }}>
            Related Tracks
          </h2>
          <div className="song-grid">
            {relatedSongs.map((song, i) => (
              renderSongCard(song, i, relatedSongs)
            ))}
          </div>
        </>
      )}

      <audio
        ref={audioRef}
        style={{ display: 'none' }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          playNext();
        }}
        onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onError={() => {
          if (currentSong) {
            setPlaying(false);
            setError(`"${currentSong.title}" is unavailable from its catalog source.`);
          }
        }}
      />

      {/* Floating Player Bar */}
      {currentSong && (
        <div className="music-player glass">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>

            {currentSong.artworkUrl && (
              <img
                src={currentSong.artworkUrl}
                alt=""
                style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
              />
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentSong.title}
              </p>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentSong.artist}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
              <button
                className="control-btn"
                style={{ color: isShuffle ? '#7C3AED' : 'inherit' }}
                onClick={() => setIsShuffle((prev) => !prev)}
                title="Toggle shuffle"
              >
                🔀
              </button>
              <button className="control-btn" onClick={playPrev}>⏮</button>
              <button className="control-btn play-pause" onClick={togglePlayPause}>
                {playing ? '⏸' : '▶'}
              </button>
              <button className="control-btn" onClick={() => playNext(true)}>⏭</button>
              <button className="control-btn" onClick={playRelatedQueue} title="Play related songs">
                🎯
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 2, minWidth: 180 }}>
              <span style={{ fontSize: '0.75rem', color: '#6B7280', flexShrink: 0 }}>{formatTime(elapsed)}</span>
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={1}
                value={elapsed}
                onChange={handleSeek}
                style={{ flex: 1, accentColor: '#7C3AED', cursor: 'pointer', height: 4 }}
              />
              <span style={{ fontSize: '0.75rem', color: '#6B7280', flexShrink: 0 }}>{formatTime(duration)}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
              <span style={{ fontSize: '0.9rem' }}>🔊</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={volume}
                onChange={(e) => setVolume(parseInt(e.target.value))}
                style={{ width: 70, accentColor: '#7C3AED', cursor: 'pointer', height: 4 }}
              />
            </div>

          </div>
        </div>
      )}

      {currentSong && <div style={{ height: 120 }} />}
      <Sidebar
        isOpen={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        currentSong={currentSong}
        onPlaySong={(song) => {
          const queue = [song, ...recommendedSongs.filter((item) => item.id !== song.id)];
          playSong(song, 0, queue);
          setLibraryOpen(false);
        }}
        onLibraryChange={() => refreshLibrary((version) => version + 1)}
      />
      <Footer />
    </div>
  );
}
