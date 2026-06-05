import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"
import http from "node:http"

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
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
        agent: apiProxyAgent,
      },
      "/static": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
        agent: apiProxyAgent,
      },
    },
  },
})
