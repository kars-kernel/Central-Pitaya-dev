import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "build",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("/katex/")) return "math";
            if (id.includes("/@tiptap/") || id.includes("/prosemirror-"))
              return "editor";
            if (id.includes("/@xyflow/")) return "maps";
          }
        },
      },
    },
  },
  server: { proxy: { "/api": "http://127.0.0.1:3000" } },
});
