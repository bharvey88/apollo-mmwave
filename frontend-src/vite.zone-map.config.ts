import { defineConfig } from "vite";
import { bundle } from "./vite.config";

// The zone-drawing card ships as its own file because HA loads it as a
// separate card resource. Task 10 renames both the element and this output.
export default defineConfig(
  bundle("zone-mapper-card", "src/zone-map/card.ts")
);
