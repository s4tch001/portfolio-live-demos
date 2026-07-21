// Thin accessors for the libraries loaded as <script> tags in index.html
// (self-hosted under /vendor/ for the China deployment — no external CDNs).
// Keeping them on window (rather than npm-bundling) preserves the exact
// versions the legacy app shipped. A future npm migration only touches this
// one file.

export const getDOMPurify = () => window.DOMPurify || null;
export const getExcelJS = () => window.ExcelJS || null;
export const getHtml2Canvas = () => window.html2canvas || null;
export const getJSZip = () => window.JSZip || null;
