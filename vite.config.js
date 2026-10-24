import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // The vendored Demonanic engine resolves sprite URLs through PUBLIC_URL.
  define: { "process.env.PUBLIC_URL": JSON.stringify("") },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/test/setup.js"],
  },
});
