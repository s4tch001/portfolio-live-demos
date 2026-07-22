(function () {
  var theme = 'light';
  try {
    theme = localStorage.getItem('theme') || 'light';
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
