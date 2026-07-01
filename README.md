# Apollo mmWave

A single Home Assistant integration for **every Apollo mmWave sensor** — radar
tuning *and* zone mapping, from one HACS install.

When you set it up, Apollo mmWave adds an **"Apollo mmWave" dashboard** to your
sidebar with **one tab per detected device**:

- **MSR-1 / MSR-2** (LD2410) → a **Radar Tuning** tab (distance chart, per-gate
  energy chart, thresholds, detection range, occupancy).
- **R-PRO-1** (LD2412 + LD2450) → **Radar Tuning** *and* a **Zone Map** (draw
  occupancy zones over the LD2450's live targets) in the same tab.
- **MTR-1** (LD2450) → a **Zone Map** tab.

No raw-YAML editing, no Streamline/Plotly, and **no separate card downloads** —
the integration serves all of its frontend itself.

> Radar-tuning charts were inspired by MirkoP's MSR tuning dashboard; this
> project replaces the manual HACS + Streamline + Plotly + paste-950-lines setup
> with a zero-config dashboard.

## What's inside

| Piece | Role |
| --- | --- |
| `custom_components/apollo_mmwave` | The integration: zone backend (occupancy sensors + `apollo_mmwave.update_zone` service), serves the bundled JS, and registers the dashboard. |
| `…/www/apollo-radar-tuning.js` | Tuning cards + the `custom:apollo-radar-tuning` dashboard strategy (built from `frontend-src/`). |
| `…/www/zone-mapper-card.js` | The 2D zone-drawing card, vendored from [zone-mapper-card](https://github.com/ApolloAutomation/zone-mapper-card). |

The dashboard is **strategy-backed**: it re-detects your devices on every load,
so adding or removing a sensor just adds or removes a tab — nothing to maintain.

## Install (HACS)

1. HACS → ⋮ → **Custom repositories** → add this repo as type **Integration**.
2. Install **Apollo mmWave**, then restart Home Assistant.
3. **Settings → Devices & Services → Add Integration → Apollo mmWave.**
4. **Reload your browser once** (Ctrl/Cmd+Shift+R) so the dashboard's cards load.
5. Open the new **Apollo mmWave** dashboard in your sidebar.

Prefer to lay things out yourself? Turn off the dashboard in the integration's
options, or just hide it from your profile — the cards and strategy are still
available to add manually.

> **Already using the standalone Zone Mapper card?** You can remove it — this
> integration bundles its own copy. (If you leave it installed, nothing breaks;
> the bundled copy guards against a duplicate registration.)

## Development

Frontend source lives in `frontend-src/` (TypeScript + Lit + Vite, with Vitest
tests). The build writes straight into the integration's `www/` folder:

```bash
cd frontend-src
npm install
npm test         # vitest
npm run build    # → ../custom_components/apollo_mmwave/www/apollo-radar-tuning.js
```

See `frontend-src/vendor/zone-mapper-card.md` for how the zone-mapping card is
vendored and the two patches to re-apply when updating it.

## Credits

- Zone-mapping backend & card: Apollo Automation's
  [zone-mapper](https://github.com/ApolloAutomation/zone-mapper) /
  [zone-mapper-card](https://github.com/ApolloAutomation/zone-mapper-card).
- Radar-tuning dashboard inspiration: MirkoP's MSR tuning dashboard.
