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
   the standalone card installed doesn't hit a custom-element name collision.

3. **Polyfill-aware registration** — HA's frontend loads the
   `@webcomponents/scoped-custom-element-registry` polyfill inside the async
   app bundle; anything defined on the native registry before that polyfill
   installs is invisible to Lovelace lookups ("Custom element doesn't exist").
   Replace the guarded define from patch 2 with the IIFE at the end of the
   current file: it defines immediately, then re-asserts via a fresh
   `window.customElements` once `home-assistant`/`hc-main` are defined (the
   app is booted and the registry is final by then). This mirrors
   `frontend-src/src/register.ts` — keep the two in sync.

All are mechanical replacements (see the scaffolding commit and the 1.2.2
commit for the exact edits).
