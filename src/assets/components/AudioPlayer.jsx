import React, { useCallback, useEffect, useRef, useState } from 'react';
import { enrichTrack, searchUniversal } from '../../services/catalogService.js';

const getPlaybackOptions = (track) => {
  const options = [
    ...(Array.isArray(track?.playbackOptions) ? track.playbackOptions : []),
    { url: track?.previewUrl || track?.url, source: track?.source },
  ];
  const seen = new Set();
  return options.filter((option) => {
    if (!option?.url || seen.has(option.url)) return false;
    seen.add(option.url);
    return true;
  });
};

const normalize = (value) => String(value || '').trim().toLowerCase();

const AudioPlayer = ({
  currentSong,
  isPlaying,
  volume,
  seekTime,
  onTimeUpdate,
  onDurationChange,
  onEnded,
  onError,
  onSourceChange,
}) => {
  const [activeSource, setActiveSource] = useState('');
  const audioRef = useRef(null);
  const latestPropsRef = useRef({});
  const playbackOptionsRef = useRef([]);
  const attemptedUrlsRef = useRef(new Set());
  const activeOptionIndexRef = useRef(0);
  const skipTimeoutRef = useRef(null);

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
  }, [currentSong, isPlaying, volume, onTimeUpdate, onDurationChange, onEnded, onError]);

  useEffect(() => {
    onSourceChange?.(activeSource);
  }, [activeSource, onSourceChange]);

  const playOption = useCallback((song, index) => {
    const audio = audioRef.current;
    const option = playbackOptionsRef.current[index];
    if (!audio || !option || latestPropsRef.current.currentSong !== song) return false;

    activeOptionIndexRef.current = index;
    attemptedUrlsRef.current.add(option.url);
    audio.pause();
    audio.src = option.url;
    audio.volume = latestPropsRef.current.volume / 100;
    audio.load();
    setActiveSource(option.source || song.source || 'audio');

    if (latestPropsRef.current.isPlaying) {
      audio.play().catch((error) => {
        if (latestPropsRef.current.currentSong === song) {
          latestPropsRef.current.onError?.('Playback was blocked. Press play to try again.');
        }
        console.warn('Audio playback failed:', error);
      });
    }

    return true;
  }, []);

  const handleMediaError = useCallback(async () => {
    const song = latestPropsRef.current.currentSong;
    const audio = audioRef.current;
    if (!song || !audio) return;

    const activeOption = playbackOptionsRef.current[activeOptionIndexRef.current];
    const failedUrl = audio.currentSrc || audio.src;
    if (!activeOption || (failedUrl && failedUrl !== activeOption.url)) return;
    attemptedUrlsRef.current.add(activeOption.url);

    let nextIndex = playbackOptionsRef.current.findIndex(
      (option) => !attemptedUrlsRef.current.has(option.url)
    );

    if (nextIndex < 0) {
      try {
        const matches = await searchUniversal(`${song.artist} ${song.title}`);
        if (latestPropsRef.current.currentSong !== song) return;

        const exactMatches = matches.filter(
          (track) =>
            normalize(track.title) === normalize(song.title) &&
            normalize(track.artist) === normalize(song.artist)
        );
        const knownUrls = new Set(playbackOptionsRef.current.map((option) => option.url));
        const alternatives = exactMatches.flatMap(getPlaybackOptions)
          .filter((option) => !knownUrls.has(option.url));
        playbackOptionsRef.current = [...playbackOptionsRef.current, ...alternatives];
        nextIndex = playbackOptionsRef.current.findIndex(
          (option) => !attemptedUrlsRef.current.has(option.url)
        );
      } catch (error) {
        console.warn('Unable to search other music providers:', error);
      }
    }

    if (latestPropsRef.current.currentSong !== song) return;
    if (nextIndex >= 0) {
      const nextOption = playbackOptionsRef.current[nextIndex];
      latestPropsRef.current.onError?.(`Trying ${nextOption.source || 'another'} stream...`);
      playOption(song, nextIndex);
      return;
    }

    latestPropsRef.current.onError?.(
      `No playable stream for "${song.title}" was found on Audius, Jamendo, or Deezer.`
    );
    clearTimeout(skipTimeoutRef.current);
    skipTimeoutRef.current = setTimeout(() => {
      if (latestPropsRef.current.currentSong === song) {
        latestPropsRef.current.onEnded?.();
      }
    }, 1500);
  }, [playOption]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!currentSong) {
      audio?.pause();
      audio?.removeAttribute('src');
      return undefined;
    }

    audio?.pause();
    let cancelled = false;
    clearTimeout(skipTimeoutRef.current);
    attemptedUrlsRef.current = new Set();
    playbackOptionsRef.current = getPlaybackOptions(currentSong);

    const startTrack = async () => {
      if (playbackOptionsRef.current.length === 0) {
        try {
          const enriched = await enrichTrack(currentSong.artist, currentSong.title);
          if (cancelled || latestPropsRef.current.currentSong !== currentSong) return;
          playbackOptionsRef.current = getPlaybackOptions(enriched);
        } catch (error) {
          console.warn('Unable to find a stream for this track:', error);
        }
      }

      if (cancelled || latestPropsRef.current.currentSong !== currentSong) return;
      if (playbackOptionsRef.current.length > 0) {
        playOption(currentSong, 0);
        return;
      }

      latestPropsRef.current.onError?.(
        `No playable stream for "${currentSong.title}" was found on Audius, Jamendo, or Deezer.`
      );
      skipTimeoutRef.current = setTimeout(() => {
        if (latestPropsRef.current.currentSong === currentSong) {
          latestPropsRef.current.onEnded?.();
        }
      }, 1500);
    };

    startTrack();
    return () => {
      cancelled = true;
    };
  }, [currentSong, playOption]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (isPlaying) {
      audio.play().catch((error) => {
        console.warn('Audio playback failed:', error);
      });
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100;
  }, [volume]);

  useEffect(() => {
    if (seekTime !== null && seekTime !== undefined && audioRef.current) {
      audioRef.current.currentTime = seekTime;
    }
  }, [seekTime]);

  useEffect(() => () => clearTimeout(skipTimeoutRef.current), []);

  return (
    <audio
      ref={audioRef}
      onTimeUpdate={(event) => onTimeUpdate?.(event.currentTarget.currentTime)}
      onLoadedMetadata={(event) => onDurationChange?.(event.currentTarget.duration)}
      onEnded={(event) => {
        const activeOption = playbackOptionsRef.current[activeOptionIndexRef.current];
        if (activeOption && event.currentTarget.currentSrc === activeOption.url) onEnded?.();
      }}
      onError={handleMediaError}
    />
  );
};

export default AudioPlayer;
