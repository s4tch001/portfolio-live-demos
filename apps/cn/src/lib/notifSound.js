// Notification sound. One shared <Audio> element, throttled so a burst of
// notifications only plays the chime ONCE and never overlaps itself. The on/off
// preference persists in localStorage (default: on).
const STORAGE_KEY = 'notifSoundEnabled';
const SOUND_URL = '/assets/music/notification_sound.mp3';
const THROTTLE_MS = 1500;

let audio = null;
let lastPlay = 0;

export function isNotifSoundEnabled() {
  // Absent key → enabled by default; only an explicit 'off' disables it.
  return localStorage.getItem(STORAGE_KEY) !== 'off';
}

export function setNotifSoundEnabled(on) {
  localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
}

export function playNotifSound() {
  if (!isNotifSoundEnabled()) return;
  const now = Date.now();
  if (now - lastPlay < THROTTLE_MS) return; // coalesce a burst → a single chime
  lastPlay = now;
  try {
    if (!audio) {
      audio = new Audio(SOUND_URL);
      audio.preload = 'auto';
    }
    audio.currentTime = 0; // restart rather than overlap a still-playing chime
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) {
    /* autoplay blocked or unsupported — ignore */
  }
}
