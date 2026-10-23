import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En dev : ouvrir http://lycee-demo.localhost:5173 (école) ou http://admin.localhost:5173 (console).
// Le proxy conserve l'en-tête Host → Django sait quelle école est visée.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": { target: process.env.API_URL || "http://localhost:8000", changeOrigin: false } },
    // Sous Docker Desktop (Windows/Mac), les changements de fichiers ne sont vus que par scrutation
    watch: process.env.VITE_POLLING ? { usePolling: true, interval: 300 } : undefined,
  },
});
