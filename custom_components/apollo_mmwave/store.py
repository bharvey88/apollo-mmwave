"""
Persistent zone storage for Apollo mmWave.

Zone definitions, tracked entity pairs, and device rotation used to live only
in ``hass.data``, "persisted" by piggybacking on a RestoreEntity sensor's
attributes and re-derived at boot by string-parsing entity friendly names.
That lost data on crashes (restore states are written periodically, not per
change) and broke when entities were renamed.

``ZoneStore`` owns the data now: a ``helpers.storage.Store`` under
``.storage/apollo_mmwave.zones``, saved (debounced) on every mutation. The
in-memory shape is::

    locations = {
        "<location>": {
            "zones": {1: {"shape": ..., "data": ..., "name": ...}, ...},
            "entities": [{"x": "<entity_id>", "y": "<entity_id>"}, ...],
            "rotation_deg": 0,          # optional
        },
    }

Locations stay keyed by the card-supplied ``location`` string — it is the wire
key of the ``update_zone`` service and of the card's entity-id lookups, so it
cannot change without coordinating an upstream zone-mapper-card release.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from homeassistant.helpers.storage import Store

from .const import ATTR_ROTATION_DEG, DOMAIN, STORE_ENTITIES, STORE_ZONES

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

STORAGE_VERSION = 1
STORAGE_KEY = f"{DOMAIN}.zones"
SAVE_DELAY_SECONDS = 2.0


def _empty_location() -> dict[str, Any]:
    return {STORE_ZONES: {}, STORE_ENTITIES: []}


class ZoneStore:
    """All zone state for the integration, persisted to disk."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Create the store; call ``async_load`` before first use."""
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.locations: dict[str, dict[str, Any]] = {}

    async def async_load(self) -> bool:
        """Load from disk. Returns False when no store file exists yet."""
        data = await self._store.async_load()
        if data is None:
            return False
        self.locations = {}
        for location, raw in data.get("locations", {}).items():
            if not isinstance(raw, dict):
                continue
            loc = _empty_location()
            zones = raw.get(STORE_ZONES)
            if isinstance(zones, dict):
                # JSON object keys are strings; zone ids are ints in memory.
                for zone_key, zone_def in zones.items():
                    try:
                        zone_id = int(zone_key)
                    except (TypeError, ValueError):
                        continue
                    if isinstance(zone_def, dict):
                        loc[STORE_ZONES][zone_id] = zone_def
            entities = raw.get(STORE_ENTITIES)
            if isinstance(entities, list):
                loc[STORE_ENTITIES] = entities
            rotation = raw.get(ATTR_ROTATION_DEG)
            if rotation is not None:
                loc[ATTR_ROTATION_DEG] = rotation
            self.locations[location] = loc
        return True

    def location(self, name: str) -> dict[str, Any]:
        """Return the mutable data dict for a location, creating it if new."""
        return self.locations.setdefault(name, _empty_location())

    def zone(self, location: str, zone_id: int) -> dict[str, Any] | None:
        """Return a zone definition or None."""
        zone_def = self.location(location)[STORE_ZONES].get(zone_id)
        return zone_def if isinstance(zone_def, dict) else None

    def async_delay_save(self) -> None:
        """Schedule a debounced write-out of the current data."""
        self._store.async_delay_save(self._data_to_save, SAVE_DELAY_SECONDS)

    async def async_save(self) -> None:
        """Write the current data out immediately (used by tests/teardown)."""
        await self._store.async_save(self._data_to_save())

    async def async_remove(self) -> None:
        """Delete the store file (config entry removed)."""
        await self._store.async_remove()

    def _data_to_save(self) -> dict[str, Any]:
        return {"locations": self.locations}
