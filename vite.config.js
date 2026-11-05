import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from the site root by default. The GitHub Pages workflow sets
// GAUNTLET_BASE=/Gauntlet-s-survival/ because Pages hosts the game in a subfolder.
const base = process.env.GAUNTLET_BASE || "/";
// Each build's id (the commit on CI): baked in as __BUILD_ID__ and written to
// version.json, so open pages can tell a newer build is live (UpdateBanner).
const buildId = process.env.GITHUB_SHA || `local-${Date.now()}`;

function versionFile() {
  return {
    name: "gauntlet-version-file",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: buildId }) });
    },
  };
}

export default defineConfig(({ command }) => ({
  base,
  plugins: [react(), versionFile()],
  // The vendored Demonanic engine resolves sprite URLs through PUBLIC_URL.
  define: {
    "process.env.PUBLIC_URL": JSON.stringify(base.replace(/\/$/, "")),
    // "dev" under the dev server and tests: no update checks there.
    __BUILD_ID__: JSON.stringify(command === "build" ? buildId : "dev"),
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/test/setup.js"],
  },
}));
