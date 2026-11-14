import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api/v1/agents": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res) => {
            if ("writeHead" in res && !res.headersSent) {
              res.writeHead(503, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  success: false,
                  error: {
                    code: "GATEWAY_UNAVAILABLE",
                    message:
                      "Apollo API service is unreachable. Please ensure the backend server is running on port 3001.",
                  },
                }),
              );
            }
          });
        },
      },
      "/socket.io": { target: "http://localhost:3001", ws: true },
    },
  },
  build: { outDir: "dist", sourcemap: true },
});
