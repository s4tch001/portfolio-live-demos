import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function inlineApplicationCss() {
  return {
    name: 'inline-application-css',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const htmlAsset = Object.values(bundle).find(
        (entry) => entry.type === 'asset' && entry.fileName === 'index.html',
      );
      if (!htmlAsset || typeof htmlAsset.source !== 'string') return;

      for (const [fileName, entry] of Object.entries(bundle)) {
        if (entry.type !== 'asset' || !fileName.endsWith('.css')) continue;
        const stylesheet = `<link rel="stylesheet" crossorigin href="/${fileName}">`;
        if (!htmlAsset.source.includes(stylesheet)) continue;
        htmlAsset.source = htmlAsset.source.replace(
          stylesheet,
          `<style>${String(entry.source)}</style>`,
        );
        delete bundle[fileName];
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), inlineApplicationCss()],
  server: {
    host: '127.0.0.1',
    port: 5177,
    strictPort: true,
  },
});
