import { triggerDownload } from './xlsx.js';
import { getJSZip } from '../cdn.js';

// Download a set of built {filename, blob} files. For >1 download we fire them
// sequentially with a small gap (no JSZip dependency). China deployment: no
// third-party cloud export — every export is a direct download.
export async function runExport(files, mode, toast) {
  if (!files.length) {
    toast('Nothing to export for this range.');
    return;
  }
  for (let i = 0; i < files.length; i++) {
    triggerDownload(files[i].blob, files[i].filename);
    if (i < files.length - 1) await new Promise((r) => setTimeout(r, 400));
  }
  toast('Download started!');
}

// Multi-teacher export: download as a single .zip (one XLSX per teacher).
// Mirrors v15 executeReportExport / lesson-tracker export (zip.file(filename,
// buffer) at the zip root → `<folderName>.zip`).
export async function runExportZip(files, folderName, mode, toast) {
  if (!files.length) {
    toast('Nothing to export for this range.');
    return;
  }
  const JSZip = getJSZip();
  if (!JSZip) {
    // JSZip not ready — fall back to sequential single-file downloads.
    await runExport(files, 'download', toast);
    return;
  }
  const zip = new JSZip();
  for (const f of files) zip.file(f.filename, f.buffer || f.blob);
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, `${folderName}.zip`);
  toast('Download started!');
}

// Ensure every month spanned by [start,end] is loaded in the DataContext cache.
export async function ensureRangeLoaded(data, startStr, endStr) {
  const s = new Date(startStr);
  const e = new Date(endStr);
  if (isNaN(s) || isNaN(e) || s > e) return;
  const cur = new Date(s.getFullYear(), s.getMonth(), 1);
  const tasks = [];
  while (cur <= e) {
    tasks.push(data.ensureMonth(cur.getFullYear(), cur.getMonth()));
    cur.setMonth(cur.getMonth() + 1);
  }
  await Promise.all(tasks);
}
