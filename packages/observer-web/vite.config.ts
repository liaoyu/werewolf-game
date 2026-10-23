import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(__dirname, "../.."), "");
  const mac = (env.LINX_DEVICE_MAC || env.VITE_LINX_DEVICE_MAC || "").toUpperCase();
  return {
    define: {
      "import.meta.env.VITE_LINX_DEVICE_MAC": JSON.stringify(mac),
    },
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 5173,
      proxy: {
        "/api": "http://127.0.0.1:8787",
        "/observer": {
          target: "ws://127.0.0.1:8787",
          ws: true,
        },
      },
    },
  };
});
