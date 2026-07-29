(() => {
  const sources = [
    '/vendor/dompurify/purify.min.js',
    '/vendor/exceljs/exceljs.min.js',
    '/vendor/html2canvas/html2canvas.min.js',
    '/vendor/jszip/jszip.min.js',
  ];
  const events = ['pointermove', 'pointerdown', 'scroll', 'keydown'];
  let started = false;

  const removeListeners = () => {
    events.forEach((eventName) => {
      window.removeEventListener(eventName, loadVendors);
    });
  };

  const loadVendors = () => {
    if (started) return;
    started = true;
    removeListeners();

    sources.reduce(
      (previous, src) =>
        previous.then(
          () =>
            new Promise((resolve) => {
              const script = document.createElement('script');
              script.src = src;
              script.onload = resolve;
              script.onerror = resolve;
              document.head.appendChild(script);
            }),
        ),
      Promise.resolve(),
    );
  };

  events.forEach((eventName) => {
    window.addEventListener(eventName, loadVendors, { once: true });
  });
})();
