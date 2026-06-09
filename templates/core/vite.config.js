import { defineConfig } from 'vite';

// https://vite.dev/config/
// `base: ''` => relative asset URLs so the built dist/ is servable from any path
// (W5 boots the BUILT artifact via `vite preview`).
export default defineConfig({
  base: '',
  server: {
    host: '::',
    port: 8080,
    hmr: false,
  },
  plugins: [],
  resolve: {
    alias: {
      // Required: import the prebuilt phaser bundle (template-contract.md §2).
      phaser: 'phaser/dist/phaser.js',
    },
  },
});
