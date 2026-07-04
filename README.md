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
   Setup asks whether to add the sidebar dashboard (on by default).
4. Open the new **Apollo mmWave** dashboard in your sidebar.

The integration registers its JS as a Lovelace resource, so the cards work in
already-open tabs — no browser reload needed.

## Choosing which devices appear

By default the dashboard auto-detects **online** Apollo mmWave devices — a
device that is unplugged, or a leftover registry entry from reflashed
hardware, gets no tab. To control this yourself, open the integration's
options (Settings → Devices & Services → Apollo mmWave → Configure) and pick
**Dashboard devices**: the dashboard then shows exactly those devices,
including ones that are currently offline. Leave the selection empty to go
back to automatic detection. Changes apply immediately.

The same knob exists for hand-written strategies as a `devices` list:

```yaml
strategy:
  type: custom:apollo-radar-tuning
  devices:
    - your_device_id   # exactly these, online or not
```

## Use your own dashboards instead

Prefer to lay things out yourself? Turn off the dashboard during setup (or any
time in the integration's options — it takes effect immediately). The cards and
strategies stay available:

- **View strategy** — add a view (tab) to any dashboard that self-builds the
  full per-device layout:

  ```yaml
  strategy:
    type: custom:apollo-radar-tuning
  ```

- **Section strategy** — drop the mmWave cards into an existing *sections*
  dashboard as one section (optionally limited to a single device):

  ```yaml
  strategy:
    type: custom:apollo-radar-tuning
    device_id: your_device_id   # optional; omit for all devices
  ```

- **Cards** — `custom:apollo-radar-distance-card`,
  `custom:apollo-radar-gate-energy-card`, and `custom:zone-mapper-card` can be
  placed individually (they're in the card picker).

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

The Python backend has a pytest suite (`pytest-homeassistant-custom-component`):

```bash
uv venv && uv pip install -r requirements-test.txt
uv run --no-project pytest tests/
```

Zone data is persisted in `.storage/apollo_mmwave.zones`; installs upgrading
from ≤1.1.x are migrated automatically (including a one-time entity_id rename
to the `sensor.apollo_mmwave_*` pattern the zone-mapper card expects).

See `frontend-src/vendor/zone-mapper-card.md` for how the zone-mapping card is
vendored and the two patches to re-apply when updating it.

## Credits

- Zone-mapping backend & card: Apollo Automation's
  [zone-mapper](https://github.com/ApolloAutomation/zone-mapper) /
  [zone-mapper-card](https://github.com/ApolloAutomation/zone-mapper-card).
- Radar-tuning dashboard inspiration: MirkoP's MSR tuning dashboard.
