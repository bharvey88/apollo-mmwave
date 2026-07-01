// Keep in sync with custom_components/apollo_mmwave/manifest.json.
export const CARD_VERSION = "1.1.0";

import "./cards/distance-card";
import "./cards/gate-energy-card";
import "./strategy";

// eslint-disable-next-line no-console
console.info(
  `%c APOLLO-MMWAVE %c v${CARD_VERSION} `,
  "color:#fff;background:#03a9f4;font-weight:700;",
  "color:#03a9f4;background:#fff;font-weight:700;"
);
