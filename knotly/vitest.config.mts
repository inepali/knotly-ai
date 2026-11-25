import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Same "@/..." alias as tsconfig, so tests can import app code.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
