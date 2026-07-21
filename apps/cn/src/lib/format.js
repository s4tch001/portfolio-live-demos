import { getDOMPurify } from './cdn.js';

// --- HTML / icon helpers (ported from legacy app.js) ---

export function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function faIcon(className) {
  return `<i class="fa-solid ${className}" aria-hidden="true"></i>`;
}

// Sanitize stored rich-text (report content) before it goes into innerHTML —
// strips <script>, on* handlers, javascript: URLs, etc. Falls back to full
// escaping if DOMPurify hasn't loaded. (legacy sanitizeReportHtml)
export function sanitizeReportHtml(html) {
  const s = String(html || '');
  const dp = getDOMPurify();
  return dp && dp.sanitize ? dp.sanitize(s) : escHtml(s);
}

// --- Date helpers ---

export function dateToStr(d) {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

// Parse "YYYY-MM-DD" as a LOCAL date (avoids the UTC shift of new Date(str)).
export function parseDate(str) {
  if (!str) return new Date(NaN);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(str);
}

export function monthRange(year, month) {
  const start = dateToStr(new Date(year, month, 1));
  const end = dateToStr(new Date(year, month + 1, 0));
  return { start, end, key: `${start}:${end}` };
}

// UI-language → Intl locale for on-screen date/time formatting (China build).
// Reads localStorage['lang'] (the LanguageProvider's source of truth) so lib
// date helpers can localize without the React context. Components that show
// dates also subscribe to the language context, so they re-render — and re-read
// this — on a language switch. File EXPORTS deliberately keep a fixed locale.
const DATE_LOCALES = { us: 'en-US', cn: 'zh-CN', hk: 'zh-HK', tw: 'zh-TW' };
export function uiLocale() {
  try {
    return DATE_LOCALES[localStorage.getItem('lang')] || 'en-US';
  } catch (e) {
    return 'en-US';
  }
}

// Server timestamps → "<date> | <time>", localized. Used by notifications, the
// activity log, receipt banners and the Security page. Lives here rather than in
// NotificationsProvider (where it started) so a non-notification page can format
// a timestamp without importing a React context module.
export function formatNotifTime(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  let d;
  // A bare "YYYY-MM-DD HH:MM" from the DB is UTC — without the Z, the browser
  // would read it as local time and shift it.
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    d = new Date(s.replace(' ', 'T') + 'Z');
  } else {
    d = new Date(s);
  }
  if (isNaN(d.getTime())) return s;
  const loc = uiLocale();
  const datePart = d.toLocaleDateString(loc, { year: 'numeric', month: 'long', day: 'numeric' });
  const timePart = d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' });
  return `${datePart} | ${timePart}`;
}

// "2026-06-17" → "Jun 17, 2026" (en) / "2026年6月17日" (zh) — localized.
export function formatDateNice(str) {
  const d = parseDate(str);
  return d.toLocaleDateString(uiLocale(), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// --- Report normalization (legacy normalizeReport) ---

export function normalizeReport(r) {
  return {
    ...r,
    images: Array.isArray(r.images) ? r.images : JSON.parse(r.images || '[]'),
    absent: !!r.absent,
    link: r.link || '',
    book: r.book || '',
    pages: r.pages || '',
    class_duration: r.class_duration || '',
    absent_reason: r.absent_reason || '',
    absent_other: r.absent_other || '',
    tracker_remarks: r.tracker_remarks || '',
  };
}

// --- Image → WebP conversion for report uploads (legacy convertToWebP) ---
// Caps width at 1920px, preserves aspect ratio, encodes WebP. Returns a File.
// heic2any is large (~1MB), so only fetch it the first time a HEIC/HEIF file is
// uploaded (legacy ensureHeic2any).
let _heic2anyPromise = null;
function ensureHeic2any() {
  if (window.heic2any) return Promise.resolve();
  if (!_heic2anyPromise) {
    _heic2anyPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/vendor/heic2any/heic2any.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return _heic2anyPromise;
}

export function isHeicFile(file) {
  return (
    /image\/heic|image\/heif/i.test(file.type || '') ||
    /\.(heic|heif)$/i.test(file.name || '')
  );
}

export async function imageToWebP(file, quality = 0.82) {
  // iPhone HEIC/HEIF can't be decoded by <img> outside Safari — convert to JPEG
  // first so the canvas → WebP step works everywhere (legacy convertToWebP).
  let srcFile = file;
  if (isHeicFile(file)) {
    try {
      await ensureHeic2any();
      const out = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
      srcFile = Array.isArray(out) ? out[0] : out;
    } catch (e) {
      // Fall through — Safari may still decode the original HEIC directly.
    }
  }
  const blob = await new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(srcFile);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      const MAX = 1920;
      if (w > MAX) {
        h = Math.round((h * MAX) / w);
        w = MAX;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Conversion failed'))),
        'image/webp',
        quality,
      );
    };
    img.onerror = reject;
    img.src = url;
  }).catch(() => file); // fallback to original on failure
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', {
    type: 'image/webp',
  });
}
