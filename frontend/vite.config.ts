import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"
import http from "node:http"

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000"

const apiProxyAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30_000,
  maxSockets: 50,
  maxFreeSockets: 10,
})

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    host: "127.0.0.1",
    port: 8080,
    strictPort: true,
    allowedHosts: [".ngrok-free.dev", "localhost", "127.0.0.1"],
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        agent: apiProxyAgent,
        ws: true,
      },
      "/static": {
        target: apiProxyTarget,
        changeOrigin: true,
        agent: apiProxyAgent,
      },
    },
  },
})
