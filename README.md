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
| `…/www/apollo-radar-zone-map-card.js` | The 2D zone-drawing card, forked from [zone-mapper-card](https://github.com/ApolloAutomation/zone-mapper-card) (also built from `frontend-src/`). |

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

## Upgrading to 2.0

Most of 2.0 lands on its own the first time it starts. A few things need you to
change something by hand, so work through this list before you decide the
upgrade went wrong.

### Change these yourself

**Rename the card in any hand-written config.** The custom element is
`custom:apollo-radar-zone-map-card` now, and it takes a `device_id` plus an
optional `title` instead of `location`. A card still set to
`custom:zone-mapper-card` will show up as a missing card. There is deliberately
no alias for the old name: it was the same name the standalone Zone Mapper card
uses, so whichever bundle a browser happened to load first won it, and one
integration's card could end up writing zones into the other's backend.

**Pass `device_id` to `apollo_mmwave.update_zone`.** Automations written
against 1.x keep working: `location` is still accepted as a deprecated alias
and is matched against the display name your zones were stored under. It logs a
warning once per restart and will be removed in a later release.

**Update anything listening for `apollo_mmwave_zone_updated`.** The event now
carries `{"device_id": ...}` where it used to carry `{"location": ...}`. A
trigger reading `trigger.event.data.location` will stop matching.

Also check any `update_zone` call that passes `entities`. An empty list means
"leave the tracked pairs alone" now, where before it erased them, which is what
wiped people's configuration when a card called the service before it had
finished loading. To actually empty the list, pass `clear_entities: true`.

### What happens for you

**Target sensors are found automatically.** The card's old "Device and Targets"
picker is gone. The integration locates the radar's LD2450 X/Y target sensors
itself, so an R-PRO-1 or MTR-1 tracks targets with nothing selected by hand. If
you are on DIY hardware and need to point it somewhere else, set the pairs
through `apollo_mmwave.update_zone` with its `entities` list.

**Zone entities move onto the radar's device.** They are no longer pinned to a
generated entity id, so they show up on the radar's device page and you can
rename them to whatever you like. Upgrading keeps your existing entity ids,
custom names, and area assignments: only the internal unique id is rewritten.

**Renaming a radar no longer orphans its zones.** Zones are keyed by device id
instead of by display name.

**Zones from the older two-piece setup are imported.** If you have the
standalone `zone_mapper` integration installed, its zones are read on first
setup of 2.0. The import is read-only and nothing belonging to that integration
is renamed or removed. **Do not uninstall the old integration until you have
confirmed your zones came across**, because its restore data is the only copy
and it goes away with its entities.

**The sidebar dashboard is a real dashboard.** It has a proper name on
Settings → Dashboards, "take control" works on it, and you can delete it. On
recent Home Assistant versions the 1.3.x sidebar dashboard did not register at
all; this is the fix. Note that the "auto-create dashboard" option decides
whether the dashboard exists, so deleting it brings it back the next time the
integration loads unless you turn that option off in the integration's options
first.

**The card follows your Home Assistant theme.** Switching Home Assistant
between light and dark switches the card with it. `dark_mode` in the card
config is an override now rather than the only way to get a dark card, so
remove it if you want the card to track your theme.

### Known limitations

Editing a strategy view in the Home Assistant UI still throws away its cards.
That is how Home Assistant treats strategy views and not something this
integration can change. Use "take control" on the dashboard instead of editing
the view.

If the same zone number exists both on a device and in leftover pre-2.0 data
that later resolves to that device, the copy already on the device wins and the
leftover copy is dropped. It is written to the log when it happens, so search
your log for `apollo_mmwave` if a zone you expected is missing.

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
  `custom:apollo-radar-gate-energy-card`, and
  `custom:apollo-radar-zone-map-card` can be placed individually (they're in
  the card picker). The zone map card takes a `device_id`; `title` is display
  only.

> **Already using the standalone Zone Mapper card?** Both can be installed side
> by side. Up to 2.0.0 they fought over the same element name,
> `zone-mapper-card`, and whichever bundle a browser loaded first won it, so
> one integration's card could end up writing to the other's backend. Our card
> is now `apollo-radar-zone-map-card` and answers to nothing else, so a
> hand-written `custom:zone-mapper-card` card that meant *this* one has to be
> updated by hand.

## Development

Frontend source lives in `frontend-src/` (TypeScript + Lit + Vite, with Vitest
tests). The build writes straight into the integration's `www/` folder:

```bash
cd frontend-src
npm install
npm test         # vitest
npm run build    # → ../custom_components/apollo_mmwave/www/*.js (one pass per bundle)
```

The Python backend has a pytest suite (`pytest-homeassistant-custom-component`):

```bash
uv venv && uv pip install -r requirements-test.txt
uv run --no-project pytest tests/
```

Zone data is persisted in `.storage/apollo_mmwave.zones`; installs upgrading
from ≤1.1.x are migrated automatically. 2.0 also rewrites zone entity unique
ids from the display-name slug to the device-keyed form. Entity ids are left
alone, and the card reads its configuration over the websocket API rather than
off a fixed entity id.

The zone-drawing card is no longer vendored. It started as a copy of
[zone-mapper-card](https://github.com/ApolloAutomation/zone-mapper-card) and is
now a fork living in `frontend-src/src/zone-map/`: fixes land here first and
get offered back upstream, rather than being re-applied as patches on every
upstream drop.

## Credits

- Zone-mapping backend & card: Apollo Automation's
  [zone-mapper](https://github.com/ApolloAutomation/zone-mapper) /
  [zone-mapper-card](https://github.com/ApolloAutomation/zone-mapper-card).
- Radar-tuning dashboard inspiration: MirkoP's MSR tuning dashboard.
