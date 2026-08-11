import { defineConfig } from "vite";
import { bundle } from "./vite.config";

// The zone-drawing card ships as its own file because HA loads it as a
// separate card resource. The filename matches the element name and must stay
// in step with JS_BUNDLES in custom_components/apollo_mmwave/const.py.
export default defineConfig(
  bundle("apollo-radar-zone-map-card", "src/zone-map/card.ts")
);
