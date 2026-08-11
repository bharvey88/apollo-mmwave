import { defineConfig, type UserConfig } from "vite";

/**
 * Build one self-contained bundle straight into the integration's www/ folder,
 * which the Python side serves as a fixed list of filenames (see
 * custom_components/apollo_mmwave/const.py).
 *
 * Each bundle gets its own vite invocation on purpose. A single multi-entry
 * build hoists anything two entries share (today: src/register.ts) into a
 * hashed chunk both then import, and HA never fetches that third file. One
 * entry per build keeps every output standalone at the cost of duplicating a
 * few hundred bytes.
 *
 * emptyOutDir is off because www/ is a committed folder, not a scratch dir.
 */
export function bundle(name: string, entry: string): UserConfig {
  return {
    build: {
      outDir: "../custom_components/apollo_mmwave/www",
      emptyOutDir: false,
      lib: {
        entry,
        formats: ["es"],
        fileName: () => `${name}.js`,
      },
      rollupOptions: { output: { inlineDynamicImports: true } },
      minify: "terser",
    },
  };
}

export default defineConfig(
  bundle("apollo-radar-tuning", "src/index.ts")
);
