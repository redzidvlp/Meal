import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages serves the app from /Meal/. Dev and preview servers use the root.
const PROD_BASE = "/Meal/";

// Injected only into production builds: Vite's dev client needs inline scripts.
// A meta CSP is the only header-like control available on GitHub Pages.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

function securityMetaPlugin() {
  return {
    name: "inject-security-meta",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "</head>",
        `    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />\n  </head>`,
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const base = mode === "production" ? PROD_BASE : "/";
  return {
    base,
    // The commit short SHA doubles as the visible build id in Settings, so it is
    // easy to tell which version a phone is running. Rebuilds of the same commit
    // keep the same id and therefore do not trigger a pointless update prompt.
    define: {
      __BUILD_ID__: JSON.stringify((process.env.GITHUB_SHA || "").slice(0, 7) || "dev"),
    },
    plugins: [
      react(),
      securityMetaPlugin(),
      VitePWA({
        // "prompt" + our own virtual registration: a banner appears after each
        // deploy instead of the app silently reloading under the user.
        registerType: "prompt",
        injectRegister: null,
        includeAssets: ["favicon.ico", "apple-touch-icon.png", "favicon-32x32.png", "favicon-16x16.png"],
        manifest: {
          name: "Our Table — vegetarian meal planner",
          short_name: "Our Table",
          description: "A shared vegetarian, low-FODMAP meal planner for two: recipes, pantry, shopping and a sous-chef.",
          theme_color: "#1e4b38",
          background_color: "#f4f0e6",
          display: "standalone",
          orientation: "portrait",
          start_url: base,
          scope: base,
          icons: [
            { src: "android-chrome-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "android-chrome-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "android-chrome-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff,woff2}"],
          navigateFallback: `${base}index.html`,
          cleanupOutdatedCaches: true,
        },
        devOptions: { enabled: false },
      }),
    ],
    server: { host: "0.0.0.0", port: 5173, strictPort: true, allowedHosts: true },
    preview: { host: "0.0.0.0", port: 4173, strictPort: true },
    build: {
      target: "es2020",
      sourcemap: false,
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom"],
            supabase: ["@supabase/supabase-js"],
          },
        },
      },
    },
  };
});
