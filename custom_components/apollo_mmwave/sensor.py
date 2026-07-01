"""
Coordinate sensor platform for Apollo mmWave.

One sensor per zone; the vendored zone-mapper-card reads the zone geometry
back from this entity's attributes by constructing
``sensor.apollo_mmwave_<location_slug>_zone_<id>`` — the entity_id set here is
part of the card's wire contract, not a cosmetic choice.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.core import callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.util import slugify

from .const import (
    ATTR_DATA,
    ATTR_NAME,
    ATTR_ROTATION_DEG,
    ATTR_SHAPE,
    COORD_SENSOR_UNIQUE_ID_FMT,
    SIGNAL_ZONES_UPDATED,
    STORE_ENTITIES,
    STORE_ZONES,
)

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import HomeAssistant
    from homeassistant.helpers.entity_platform import AddEntitiesCallback

    from .store import ZoneStore

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Create coordinate sensors for stored zones, and for zones added later."""
    from . import get_store  # noqa: PLC0415 - avoid a module import cycle

    store = get_store(hass)
    added: set[tuple[str, int]] = set()

    def _sync_entities() -> None:
        current = {
            (location, zone_id)
            for location, loc in store.locations.items()
            for zone_id in loc[STORE_ZONES]
        }
        # Deleted zones' entities are removed via the registry; drop them from
        # the tracker so a re-created zone id gets a fresh entity.
        added.intersection_update(current)
        new_entities = [
            ZoneCoordsSensor(store, location, zone_id)
            for location, zone_id in sorted(current - added)
        ]
        added.update(current - added)
        if new_entities:
            async_add_entities(new_entities)

    @callback
    def _zones_updated(_location: str) -> None:
        _sync_entities()

    entry.async_on_unload(
        async_dispatcher_connect(hass, SIGNAL_ZONES_UPDATED, _zones_updated)
    )
    _sync_entities()


class ZoneCoordsSensor(SensorEntity):
    """Exposes one zone's geometry/config to the frontend via attributes."""

    _attr_should_poll = False
    _attr_icon = "mdi:vector-rectangle"

    def __init__(self, store: ZoneStore, location: str, zone_id: int) -> None:
        """Initialize from the store; state is the zone id."""
        self._store = store
        self._location = location
        self._zone_id = zone_id
        self._attr_name = f"Apollo mmWave {location} Zone {zone_id}"
        self._attr_unique_id = COORD_SENSOR_UNIQUE_ID_FMT.format(
            location=slugify(location), zone_id=zone_id
        )
        # Card contract: it looks the sensor up by this exact entity_id.
        self.entity_id = f"sensor.{self._attr_unique_id}"

    @property
    def native_value(self) -> int:
        """Return the zone id as the state."""
        return self._zone_id

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return shape/data plus location-wide entities and rotation."""
        loc = self._store.location(self._location)
        zone_def = self._store.zone(self._location, self._zone_id) or {}
        attrs: dict[str, Any] = {
            ATTR_SHAPE: zone_def.get(ATTR_SHAPE),
            ATTR_DATA: zone_def.get(ATTR_DATA),
            "entities": loc.get(STORE_ENTITIES, []),
        }
        rotation = loc.get(ATTR_ROTATION_DEG)
        if rotation is not None:
            attrs[ATTR_ROTATION_DEG] = rotation
        name = zone_def.get(ATTR_NAME)
        if isinstance(name, str) and name:
            attrs[ATTR_NAME] = name
        return attrs

    async def async_added_to_hass(self) -> None:
        """Refresh whenever this location's zones change."""

        @callback
        def _zones_updated(location: str) -> None:
            if location == self._location:
                self.async_write_ha_state()

        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_ZONES_UPDATED, _zones_updated)
        )
