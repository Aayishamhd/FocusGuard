/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Electron plugins are only loaded in Electron context.
// For the Vite-only dev server and tests, we use a simplified config.
let electronPlugins: import("vite").Plugin[] = [];

if (process.env["NODE_ENV"] !== "test") {
  try {
    // Dynamic import to avoid crashing when vite-plugin-electron is not yet installed
    const electronMod = require("vite-plugin-electron");
    const rendererMod = require("vite-plugin-electron-renderer");
    const electron = electronMod.default ?? electronMod;
    const renderer = rendererMod.default ?? rendererMod;

    electronPlugins = [
      electron([
        {
          entry: "src/main/index.ts",
          onstart(options: { startup: () => void }) {
            options.startup();
          },
          vite: {
            build: {
              sourcemap: true,
              outDir: "dist-electron/main",
              rollupOptions: { external: ["electron"] },
            },
          },
        },
        {
          entry: "src/preload/index.ts",
          onstart(options: { reload: () => void }) {
            options.reload();
          },
          vite: {
            build: {
              sourcemap: true,
              outDir: "dist-electron/preload",
              rollupOptions: { external: ["electron"] },
            },
          },
        },
      ]),
      renderer(),
    ];
  } catch {
    // vite-plugin-electron not yet installed; proceed without it
    console.warn("[FocusGuard] vite-plugin-electron not found — running in browser mode.");
  }
}

export default defineConfig({
  plugins: [react(), ...electronPlugins],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer/src"),
    },
  },
  root: ".",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
