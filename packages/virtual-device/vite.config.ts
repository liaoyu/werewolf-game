import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 5174,
    proxy: {
      "/linx": { target: "http://127.0.0.1:8787", ws: true },
      "/api": "http://127.0.0.1:8787",
      "/audio": "http://127.0.0.1:8787",
    },
  },
});
