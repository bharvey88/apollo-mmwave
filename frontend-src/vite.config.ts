import { defineConfig } from "vite";

// Build the tuning cards + dashboard strategy straight into the integration's
// www/ folder so the Python integration serves them. emptyOutDir is off so the
// vendored zone-mapper-card.js sitting alongside is never wiped.
export default defineConfig({
  build: {
    outDir: "../custom_components/apollo_mmwave/www",
    emptyOutDir: false,
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "apollo-radar-tuning.js",
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
    minify: "terser",
  },
});
