import { useEffect, useRef } from 'react';

const VIDEO_SRC = '/assets/video/login-background.webm';
const VIDEO_POSTER = '/assets/video/login-background-poster.webp';

/**
 * Shows the video's real first frame immediately, then starts the decorative
 * animation after the visitor interacts. This keeps the same visual treatment
 * while preventing a background video from delaying the page's initial paint.
 */
export default function DeferredBackgroundVideo({ id }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

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
      muted
      loop
      playsInline
      preload="none"
      poster={VIDEO_POSTER}
    />
  );
}
