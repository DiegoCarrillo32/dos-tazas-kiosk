import { defineConfig } from "vitest/config";
import path from "node:path";

// Mirrors tsconfig.json's "@/*" -> "./*" path mapping. Without this, any
// test that imports a module using the "@/..." alias (which is most of
// lib/*, since that's the project-wide convention) fails to resolve —
// vitest/Vite doesn't read tsconfig `paths` on its own.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
