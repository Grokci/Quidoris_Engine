import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local daemon runs at 8787 by default (see openapi/openapi.yaml).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/v1": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true
      }
    }
  }
});
