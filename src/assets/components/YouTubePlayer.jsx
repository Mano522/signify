/**
 * YouTube IFrame Player & Universal Audio Coordinator
 * - Renders YouTube IFrame Player API with valid DOM dimensions so browsers never block autoplay
 * - Provides an optional floating mini-video viewport toggle
 * - Automatically falls back to HTML5 audio preview if YouTube embedding is restricted (error 101/150)
 * - Fires onEnded for AUTOPLAY
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { loadYouTubeIframeApi, resolveYouTubeVideoId } from '../../services/youtubeService';
import { enrichTrack } from '../../services/catalogService';

const YouTubePlayer = ({
  currentSong,
  isPlaying,
  volume, // 0 to 100
  seekTime, // when seeking explicitly
  isVideoVisible = false, // toggle video popup
  onTimeUpdate,
  onDurationChange,
  onEnded,
  onError,
  onSourceChange,
  onToggleVideo,
}) => {
  const [activeSource, setActiveSource] = useState('youtube'); // 'youtube' | 'audio'
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const playerRef = useRef(null); // YT.Player instance
  const containerRef = useRef(null);
  const audioFallbackRef = useRef(null);
  const currentVideoIdRef = useRef(null);
  const pendingVideoIdRef = useRef(null);
  const timeIntervalRef = useRef(null);
  const skipTimeoutRef = useRef(null);
  const latestPropsRef = useRef({});
  const [playerApiFailed, setPlayerApiFailed] = useState(false);

  useEffect(() => {
    latestPropsRef.current = {
      currentSong,
      isPlaying,
      volume,
      onTimeUpdate,
      onDurationChange,
      onEnded,
      onError,
    };
  });

  const playAudioFallback = useCallback(async (url, song) => {
    const audio = audioFallbackRef.current;
    if (!audio || !url) return false;

    audio.pause();
    audio.src = url;
    audio.volume = latestPropsRef.current.volume / 100;
    audio.load();
    setActiveSource('audio');

    if (latestPropsRef.current.isPlaying) {
      try {
        await audio.play();
      } catch (error) {
        if (latestPropsRef.current.currentSong === song) {
          latestPropsRef.current.onError?.('Audio playback was blocked. Press play to try again.');
        }
        console.warn('Fallback play error:', error);
        return false;
      }
    }

    return true;
  }, []);

  // Sync active source
  useEffect(() => {
    onSourceChange?.(activeSource);
  }, [activeSource, onSourceChange]);

  // Initialize YouTube IFrame API
  useEffect(() => {
    let mounted = true;

    loadYouTubeIframeApi()
      .then((YT) => {
        if (!mounted) return;

        if (!playerRef.current && containerRef.current) {
          playerRef.current = new YT.Player(containerRef.current, {
          height: '160',
          width: '280',
          playerVars: {
            autoplay: 1,
            controls: 1,
            disablekb: 0,
            fs: 1,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onReady: (event) => {
              if (!mounted) return;
              setIsPlayerReady(true);
              event.target.setVolume(latestPropsRef.current.volume);

              if (pendingVideoIdRef.current) {
                const vid = pendingVideoIdRef.current;
                pendingVideoIdRef.current = null;
                currentVideoIdRef.current = vid;
                if (latestPropsRef.current.isPlaying) {
                  event.target.loadVideoById(vid);
                } else {
                  event.target.cueVideoById(vid);
                }
              }
            },
            onStateChange: (event) => {
              if (event.data === 0) {
                latestPropsRef.current.onEnded?.();
              }
            },
            onError: async (event) => {
              const errorCode = event.data;
              console.warn(`YouTube Player error: ${errorCode}`);

              const song = latestPropsRef.current.currentSong;
              let fallbackUrl = song?.previewUrl || song?.url;
              if (!fallbackUrl && song) {
                try {
                  const enriched = await enrichTrack(song.artist, song.title);
                  if (latestPropsRef.current.currentSong !== song) return;
                  fallbackUrl = enriched?.previewUrl || enriched?.url;
                } catch (error) {
                  console.warn('Unable to find an audio fallback:', error);
                }
              }

              if (latestPropsRef.current.currentSong !== song) return;
              if (fallbackUrl && await playAudioFallback(fallbackUrl, song)) {
                latestPropsRef.current.onError?.('YouTube playback failed. Playing the available audio stream instead.');
                playerRef.current?.stopVideo?.();
                return;
              }

              latestPropsRef.current.onError?.(
                `YouTube playback failed (${errorCode}) and no audio stream is available.`
              );
              clearTimeout(skipTimeoutRef.current);
              skipTimeoutRef.current = setTimeout(() => {
                if (latestPropsRef.current.currentSong === song) {
                  latestPropsRef.current.onEnded?.();
                }
              }, 1500);
            },
          },
        });
        }
      })
      .catch((error) => {
        if (!mounted) return;
        console.warn('YouTube IFrame API unavailable:', error);
        setPlayerApiFailed(true);
      });

    return () => {
      mounted = false;
      if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
      clearTimeout(skipTimeoutRef.current);
    };
  }, [playAudioFallback]);

  // Time polling for YouTube
  useEffect(() => {
    if (activeSource === 'youtube' && isPlaying) {
      timeIntervalRef.current = setInterval(() => {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
          try {
            const current = playerRef.current.getCurrentTime() || 0;
            const dur = playerRef.current.getDuration() || 0;
            onTimeUpdate?.(current);
            if (dur > 0) onDurationChange?.(dur);
          } catch {
            // Ignore temporary cross-frame errors
          }
        }
      }, 500);
    } else {
      if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
    }

    return () => {
      if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
    };
  }, [activeSource, isPlaying, onTimeUpdate, onDurationChange]);

  // When currentSong changes -> Play it!
  useEffect(() => {
    pendingVideoIdRef.current = null;
    if (!currentSong) return;
    const directAudioUrl = currentSong.previewUrl || currentSong.url;
    if (directAudioUrl && audioFallbackRef.current?.src === directAudioUrl) return;

    let isCancelled = false;
    clearTimeout(skipTimeoutRef.current);

    const playCurrentTrack = async () => {
      let videoId = currentSong.videoId;

      // Prefer provider audio URLs; these are the actual catalog streams/previews.
      if (!videoId && !currentSong.url && !currentSong.previewUrl) {
        videoId = await resolveYouTubeVideoId(currentSong.artist, currentSong.title);
      }

      if (isCancelled) return;

      if (videoId && !playerApiFailed) {
        currentVideoIdRef.current = videoId;
        setActiveSource('youtube');

        if (audioFallbackRef.current) {
          audioFallbackRef.current.pause();
          audioFallbackRef.current.removeAttribute('src');
        }

        if (isPlayerReady && playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
          playerRef.current.setVolume(latestPropsRef.current.volume);
          if (latestPropsRef.current.isPlaying) {
            playerRef.current.loadVideoById(videoId);
          } else {
            playerRef.current.cueVideoById(videoId);
          }
        } else {
          pendingVideoIdRef.current = videoId;
        }
      } else {
        let fallbackUrl = currentSong.previewUrl || currentSong.url;

        if (!fallbackUrl) {
          const enriched = await enrichTrack(currentSong.artist, currentSong.title);
          fallbackUrl = enriched?.previewUrl || enriched?.url || '';
        }

        if (isCancelled) return;
        if (fallbackUrl && await playAudioFallback(fallbackUrl, currentSong)) {
          if (playerRef.current && typeof playerRef.current.stopVideo === 'function') {
            playerRef.current.stopVideo();
          }
        } else {
          latestPropsRef.current.onError?.(`Unable to find a playable stream for "${currentSong.title}".`);
          skipTimeoutRef.current = setTimeout(() => {
            if (latestPropsRef.current.currentSong === currentSong) {
              latestPropsRef.current.onEnded?.();
            }
          }, 2000);
        }
      }
    };

    playCurrentTrack();

    return () => {
      isCancelled = true;
    };
  }, [currentSong, isPlayerReady, playerApiFailed, playAudioFallback]);

  // Sync Play / Pause
  useEffect(() => {
    if (activeSource === 'youtube') {
      if (playerRef.current && isPlayerReady) {
        if (isPlaying && typeof playerRef.current.playVideo === 'function') {
          playerRef.current.playVideo();
        } else if (!isPlaying && typeof playerRef.current.pauseVideo === 'function') {
          playerRef.current.pauseVideo();
        }
      }
    } else if (activeSource === 'audio' && audioFallbackRef.current) {
      if (isPlaying) {
        audioFallbackRef.current.play().catch(() => {});
      } else {
        audioFallbackRef.current.pause();
      }
    }
  }, [isPlaying, activeSource, isPlayerReady]);

  // Sync Volume
  useEffect(() => {
    if (activeSource === 'youtube' && playerRef.current && typeof playerRef.current.setVolume === 'function') {
      playerRef.current.setVolume(volume);
    } else if (activeSource === 'audio' && audioFallbackRef.current) {
      audioFallbackRef.current.volume = volume / 100;
    }
  }, [volume, activeSource]);

  // Sync Seek
  useEffect(() => {
    if (seekTime === null || seekTime === undefined) return;
    if (activeSource === 'youtube' && playerRef.current && typeof playerRef.current.seekTo === 'function') {
      playerRef.current.seekTo(seekTime, true);
    } else if (activeSource === 'audio' && audioFallbackRef.current) {
      audioFallbackRef.current.currentTime = seekTime;
    }
  }, [seekTime, activeSource]);

  return (
    <>
      {/* Floating Video Player Window */}
      <div
        style={{
          position: 'fixed',
          bottom: isVideoVisible ? 120 : -9999,
          right: 24,
          width: 280,
          height: 160,
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: isVideoVisible ? '0 12px 36px rgba(0,0,0,0.35)' : 'none',
          border: isVideoVisible ? '2px solid rgba(124, 58, 237, 0.4)' : 'none',
          zIndex: isVideoVisible ? 998 : -1,
          opacity: isVideoVisible ? 1 : 0.001,
          pointerEvents: isVideoVisible ? 'all' : 'none',
          background: '#000',
          transition: 'opacity 0.25s ease, transform 0.25s ease',
        }}
      >
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <div ref={containerRef} id="yt-player-container" />
          {isVideoVisible && (
            <button
              onClick={onToggleVideo}
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                background: 'rgba(0,0,0,0.6)',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: 26,
                height: 26,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
                zIndex: 10,
              }}
              title="Close video view"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* HTML5 Audio Fallback */}
      <audio
        ref={audioFallbackRef}
        onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => onDurationChange?.(e.currentTarget.duration)}
        onEnded={() => onEnded?.()}
        onError={() => {
          onError?.('Audio stream preview error.');
        }}
      />
    </>
  );
};

export default YouTubePlayer;
