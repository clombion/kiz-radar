// The site's build: site/'s two entries, main.ts (index.html and each community's page) and review.ts (review.html),
// bundled by Vite into public/js/ as main.js and review.js, with the modules both use in one shared-<hash>.js beside
// them. Vite builds the scripts and never the pages: the committed HTML loads js/main.js and js/review.js by those
// names, relative to its <base>, so the site works under /kiz-radar/, under c/<key>/ and at a server's root alike. Every
// file is flat in js/, since the code finds ../data/ and ../vendor/ from its own module's URL. The shared chunk's name
// carries its content's hash: a main.js cached from before a deploy then asks for the chunk it was built with, where a
// fixed name could hand it a newer one whose exports Rolldown named otherwise. Solid's plugin compiles the JSX (.tsx)
// with its native compiler; the build takes Solid's production build, by Vite's own condition with NODE_ENV unset, never
// its development one, which only the tests take (vitest.config.ts).
import solid from '@solidjs/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [solid()],
  publicDir: false, // public/ is the published site, not files for Vite to copy
  build: {
    outDir: 'public/js', // emptied by the build script, which clears public/vendor/ with it
    emptyOutDir: false,
    // no helper for a dynamic import(): the site has none, and one added later is loaded as written
    modulePreload: false,
    rolldownOptions: {
      input: { main: 'site/main.ts', review: 'site/review.ts' },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        // the modules both entries import, in one chunk
        codeSplitting: { groups: [{ name: 'shared', minShareCount: 2 }] },
      },
    },
  },
});
