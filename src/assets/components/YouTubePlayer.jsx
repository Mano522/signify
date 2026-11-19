/**
 * YouTube IFrame Player & Audio Coordinator
 * - Dynamically mounts YouTube IFrame Player API
 * - Manages playback, seek, volume, and state
 * - Fires onEnded for AUTOPLAY
 * - Detects YouTube error 101/150 (not embeddable) -> auto-skips to next track
 * - Handles quota exceeded or missing key by falling back to Deezer audio preview
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { loadYouTubeIframeApi, resolveYouTubeVideoId, checkIsYouTubeQuotaExceeded } from '../../services/youtubeService';

const YouTubePlayer = ({
  currentSong,
  isPlaying,
  volume, // 0 to 100
  seekTime, // when seeking explicitly
  onTimeUpdate,
  onDurationChange,
  onEnded,
  onError,
  onSourceChange,
}) => {
  const [activeSource, setActiveSource] = useState('youtube'); // 'youtube' | 'deezer'
  const playerRef = useRef(null); // YT.Player instance
  const containerRef = useRef(null);
  const audioFallbackRef = useRef(null);
  const isApiReadyRef = useRef(false);
  const currentVideoIdRef = useRef(null);
  const timeIntervalRef = useRef(null);

  // Sync active source upwards
  useEffect(() => {
    onSourceChange?.(activeSource);
  }, [activeSource, onSourceChange]);

  // Initialize YouTube IFrame API
  useEffect(() => {
    let mounted = true;
    loadYouTubeIframeApi().then((YT) => {
      if (!mounted) return;
      isApiReadyRef.current = true;

      // Create hidden/mini YouTube player container
      if (!playerRef.current && containerRef.current) {
        playerRef.current = new YT.Player(containerRef.current, {
          height: '1',
          width: '1',
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onReady: (event) => {
              event.target.setVolume(volume);
            },
            onStateChange: (event) => {
              // 0 = YT.PlayerState.ENDED
              if (event.data === 0) {
                onEnded?.();
              }
            },
            onError: (event) => {
              // 101 or 150 = Video not embeddable by owner
              // 2 = Invalid parameter
              // 5 = HTML5 player error
              // 100 = Video not found
              const errorCode = event.data;
              console.warn(`YouTube Player error: ${errorCode}`);
              if (errorCode === 150 || errorCode === 101) {
                onError?.('This video cannot be embedded. Auto-skipping to next song...');
              } else {
                onError?.(`Playback error (${errorCode}). Skipping...`);
              }
              // Auto-skip after brief moment
              setTimeout(() => {
                onEnded?.();
              }, 1200);
            },
          },
        });
      }
    });

    return () => {
      mounted = false;
      if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
    };
  }, []);

  // Poll current time when playing on YouTube
  useEffect(() => {
    if (activeSource === 'youtube' && isPlaying) {
      timeIntervalRef.current = setInterval(() => {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
          const current = playerRef.current.getCurrentTime() || 0;
          const dur = playerRef.current.getDuration() || 0;
          onTimeUpdate?.(current);
          if (dur > 0) onDurationChange?.(dur);
        }
      }, 500);
    } else {
      if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
    }

    return () => {
      if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
    };
  }, [activeSource, isPlaying, onTimeUpdate, onDurationChange]);

  // When currentSong changes -> Resolve YouTube video ID Just-In-Time
  useEffect(() => {
    if (!currentSong) return;

    let isCancelled = false;

    const preparePlayback = async () => {
      // 1. Try resolving YouTube Video ID
      const videoId = await resolveYouTubeVideoId(currentSong.artist, currentSong.title);

      if (isCancelled) return;

      if (videoId && playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
        currentVideoIdRef.current = videoId;
        setActiveSource('youtube');
        // Stop any fallback audio
        if (audioFallbackRef.current) {
          audioFallbackRef.current.pause();
          audioFallbackRef.current.removeAttribute('src');
        }
        playerRef.current.loadVideoById(videoId);
        playerRef.current.setVolume(volume);
        if (isPlaying) {
          playerRef.current.playVideo();
        }
      } else {
        // Fallback to Deezer 30s preview audio or direct url
        const fallbackUrl = currentSong.previewUrl || currentSong.url;
        if (fallbackUrl && audioFallbackRef.current) {
          setActiveSource('deezer');
          if (playerRef.current && typeof playerRef.current.stopVideo === 'function') {
            playerRef.current.stopVideo();
          }
          audioFallbackRef.current.src = fallbackUrl;
          audioFallbackRef.current.volume = volume / 100;
          if (isPlaying) {
            audioFallbackRef.current.play().catch((err) => {
              console.warn('Fallback audio play error:', err);
            });
          }
        } else {
          onError?.('No playable stream found for this track.');
        }
      }
    };

    preparePlayback();

    return () => {
      isCancelled = true;
    };
  }, [currentSong]);

  // Handle Play / Pause sync
  useEffect(() => {
    if (activeSource === 'youtube') {
      if (playerRef.current) {
        if (isPlaying && typeof playerRef.current.playVideo === 'function') {
          playerRef.current.playVideo();
        } else if (!isPlaying && typeof playerRef.current.pauseVideo === 'function') {
          playerRef.current.pauseVideo();
        }
      }
    } else if (activeSource === 'deezer' && audioFallbackRef.current) {
      if (isPlaying) {
        audioFallbackRef.current.play().catch(() => {});
      } else {
        audioFallbackRef.current.pause();
      }
    }
  }, [isPlaying, activeSource]);

  // Handle Volume
  useEffect(() => {
    if (activeSource === 'youtube' && playerRef.current && typeof playerRef.current.setVolume === 'function') {
      playerRef.current.setVolume(volume);
    } else if (activeSource === 'deezer' && audioFallbackRef.current) {
      audioFallbackRef.current.volume = volume / 100;
    }
  }, [volume, activeSource]);

  // Handle Seek
  useEffect(() => {
    if (seekTime === null || seekTime === undefined) return;
    if (activeSource === 'youtube' && playerRef.current && typeof playerRef.current.seekTo === 'function') {
      playerRef.current.seekTo(seekTime, true);
    } else if (activeSource === 'deezer' && audioFallbackRef.current) {
      audioFallbackRef.current.currentTime = seekTime;
    }
  }, [seekTime, activeSource]);

  return (
    <div style={{ position: 'fixed', bottom: -100, left: -100, opacity: 0, pointerEvents: 'none' }}>
      {/* Hidden YouTube IFrame */}
      <div ref={containerRef} id="yt-player-container" />

      {/* HTML5 Audio Fallback */}
      <audio
        ref={audioFallbackRef}
        onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => onDurationChange?.(e.currentTarget.duration)}
        onEnded={() => onEnded?.()}
        onError={() => {
          onError?.('Preview playback failed.');
        }}
      />
    </div>
  );
};

export default YouTubePlayer;
