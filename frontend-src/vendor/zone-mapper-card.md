# Vendored: zone-mapper-card

`custom_components/apollo_mmwave/www/zone-mapper-card.js` is vendored from
[ApolloAutomation/zone-mapper-card](https://github.com/ApolloAutomation/zone-mapper-card)
(`dist/zone-mapper-card.js`) so the Apollo mmWave integration can serve it
directly — no separate HACS card install.

## Patches applied on re-vendor

When pulling a newer upstream build, re-apply these two patches:

1. **Backend domain** — replace every `zone_mapper` (underscore) with
   `apollo_mmwave`. This repoints the `callService('apollo_mmwave','update_zone', …)`
   calls and the `sensor.apollo_mmwave_<loc>_zone_<id>` reads at this
   integration's domain. (The element name `zone-mapper-card` uses hyphens and is
   intentionally left unchanged.)

2. **Registration guard** — wrap the element definition so a user who also has
   the standalone card installed doesn't hit a custom-element name collision:

   ```js
   if (!customElements.get('zone-mapper-card')) {
     customElements.define('zone-mapper-card', ZoneMapperCard);
   }
   ```

Both are mechanical string replacements (see the scaffolding commit for the
exact script).
