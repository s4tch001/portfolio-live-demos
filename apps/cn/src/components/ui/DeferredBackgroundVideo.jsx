import { useEffect, useRef, useState } from 'react';

const VIDEO_SRC = '/assets/video/login-background.webm';
const VIDEO_POSTER = '/assets/video/login-background-poster.webp';

/**
 * Defers decorative playback until interaction. Landing pages can keep a
 * static fallback visible until the first video frame is actually playing.
 */
export default function DeferredBackgroundVideo({ id, revealAfterPlaying = false }) {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    let started = false;
    let fallbackTimer;
    const events = ['pointermove', 'pointerdown', 'scroll', 'keydown'];

    const removeListeners = () => {
      events.forEach((eventName) => {
        window.removeEventListener(eventName, startVideo);
      });
    };

    const startVideo = () => {
      if (started) return;
      started = true;
      removeListeners();
      window.clearTimeout(fallbackTimer);
      video.src = VIDEO_SRC;
      video.load();
      video.play().catch(() => {
        // The poster remains visible if a browser blocks decorative autoplay.
      });
    };

    events.forEach((eventName) => {
      window.addEventListener(eventName, startVideo, { passive: true, once: true });
    });
    fallbackTimer = window.setTimeout(startVideo, 15000);

    return () => {
      removeListeners();
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  return (
    <video
      id={id}
      ref={videoRef}
      className={revealAfterPlaying && isPlaying ? 'deferred-background-video-playing' : undefined}
      muted
      loop
      playsInline
      preload="none"
      poster={revealAfterPlaying ? undefined : VIDEO_POSTER}
      onPlaying={revealAfterPlaying ? () => setIsPlaying(true) : undefined}
    />
  );
}
