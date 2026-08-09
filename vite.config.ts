import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;
const managedPort = Number.parseInt(process.env.ROSA_DEV_PORT ?? "", 10);
const port = Number.isInteger(managedPort) ? managedPort : 5173;
const managedHmrPort = Number.parseInt(process.env.ROSA_HMR_PORT ?? "", 10);
const hmrPort = Number.isInteger(managedHmrPort) ? managedHmrPort : port + 1;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: host || false,
    port,
    // 일반 웹 개발에서는 다음 빈 포트를 찾는다. Tauri 래퍼가 고른 포트는 devUrl과 같아야 한다.
    strictPort: Number.isInteger(managedPort),
    hmr: host ? { protocol: "ws", host, port: hmrPort } : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target:
      process.env.TAURI_PLATFORM === "windows" ? "chrome105" : "safari14",
    minify: !process.env.TAURI_DEBUG ? "oxc" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
