import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Ballast | מעקב אימוני כושר',
        short_name: 'Ballast',
        description: 'אפליקציית מעקב אימוני כושר אישית - תרגילים, סטים ומשקלים',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0a0a0c',
        theme_color: '#0a0a0c',
        orientation: 'portrait',
        dir: 'rtl',
        lang: 'he',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // רק מעטפת האפליקציה (JS/CSS/HTML + אייקונים קטנים) נכנסת ל"precache" הגרסתי -
        // זה מה שבודקים בכל עדכון, אז חייבים לשמור את זה קטן כדי שעדכונים יתפסו מהר.
        globPatterns: ['**/*.{js,css,html,ico,svg}', 'icons/*.png', 'manifest.webmanifest'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // תמונות התרגילים (הכבדות, ~12MB) נשמרות בנפרד בזמן ריצה - נטענות פעם אחת ונשארות
        // במטמון לזמן ארוך, אבל לא חוסמות/מאיטות עדכון גרסה של האפליקציה עצמה.
        runtimeCaching: [
          {
            urlPattern: /\/exercises2?\/.*\.(jpg|jpeg|png|gif)$/i,
            handler: 'CacheFirst',
            options: {
              // שם חדש (היה 'exercise-images') - כדי לנטרל cache ישן שאולי "תקוע" עם תגובות
              // כושלות/opaque שנכנסו אליו בעבר. CacheFirst אף פעם לא מתקן את זה בעצמו.
              cacheName: 'exercise-images-v2',
              expiration: {
                maxEntries: 400,
                maxAgeSeconds: 60 * 60 * 24 * 90,
              },
              // רק 200 אמיתי נכנס ל-cache - status 0 (תגובה opaque, למשל מכשל רשת חד-פעמי)
              // הוסר בכוונה, כדי שכשל טעינה לא "יינעל" ל-90 יום כאילו היה הצלחה.
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
});
