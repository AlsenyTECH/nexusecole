import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En dev : ouvrir http://lycee-a.localhost:5173 (école) ou http://admin.localhost:5173 (console).
// Le proxy conserve l'en-tête Host → Django sait quelle école est visée.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": { target: "http://localhost:8000", changeOrigin: false } },
  },
});
