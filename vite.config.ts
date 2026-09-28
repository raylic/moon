import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/**
 * GitHub Pages 的项目站点挂在 `https://raylic.github.io/moon/` 这个**子路径**下，
 * 所以所有资源引用都必须带 `/moon/` 前缀，否则线上全 404。
 *
 * manifest 的 `start_url` / `scope` 必须跟着一起改：它们**不会**自动继承 `base`，
 * 漏改的后果是「网页版正常、装到主屏后打开白屏」—— 所以这里用同一个常量，避免漂移。
 */
const BASE = "/moon/";

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/moon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Moon · 月经记录",
        short_name: "Moon",
        description: "本地优先的月经记录与预测",
        lang: "zh-CN",
        start_url: BASE,
        scope: BASE,
        display: "standalone",
        orientation: "portrait",
        background_color: "#FAF8F6",
        theme_color: "#FAF8F6",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          { src: "icons/moon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      },
    }),
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});