import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa'; // <-- 1. Add this import at the top

export default defineConfig({
  base: '/Meal/',
  plugins: [
    react(),
    VitePWA({ // <-- 2. Add the PWA plugin right after it
      registerType: 'prompt',
      // We can add more stuff here later like your app icons, but this is enough for now
    })
  ],
});