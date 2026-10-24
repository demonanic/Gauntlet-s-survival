import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from the site root by default. The GitHub Pages workflow sets
// GAUNTLET_BASE=/Gauntlet-s-survival/ because Pages hosts the game in a subfolder.
const base = process.env.GAUNTLET_BASE || "/";

export default defineConfig({
  base,
  plugins: [react()],
  // The vendored Demonanic engine resolves sprite URLs through PUBLIC_URL.
  define: { "process.env.PUBLIC_URL": JSON.stringify(base.replace(/\/$/, "")) },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/test/setup.js"],
  },
});
