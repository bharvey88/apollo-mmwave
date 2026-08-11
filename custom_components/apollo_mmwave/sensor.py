"""
Zone geometry sensor platform for Apollo mmWave.

One sensor per drawn zone, carrying the zone's shape and data as attributes.
Its identity is the radar's Home Assistant device id plus the zone id, and it
is registered against that device, so it shows up on the radar's device page
and users can rename it however they like. Nothing builds an entity id from a
display name any more: consumers find these entities through the device.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.core import callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from .const import (
    ATTR_DATA,
    ATTR_NAME,
    ATTR_ROTATION_DEG,
    ATTR_SHAPE,
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
    """Create geometry sensors for stored zones, and for zones added later."""
    from . import get_store  # noqa: PLC0415 - avoid a module import cycle

    store = get_store(hass)
    added: set[tuple[str, int]] = set()

    def _sync_entities() -> None:
        current = {
            (device_id, zone_id)
            for device_id, device in store.devices.items()
            for zone_id in device[STORE_ZONES]
        }
        # Deleted zones' entities are removed via the registry; drop them from
        # the tracker so a re-created zone id gets a fresh entity.
        added.intersection_update(current)
        new_entities = [
            ZoneCoordsSensor(hass, store, device_id, zone_id)
            for device_id, zone_id in sorted(current - added)
        ]
        added.update(current - added)
        if new_entities:
            async_add_entities(new_entities)

    @callback
    def _zones_updated(_device_id: str) -> None:
        _sync_entities()

    entry.async_on_unload(
        async_dispatcher_connect(hass, SIGNAL_ZONES_UPDATED, _zones_updated)
    )
    _sync_entities()


class ZoneCoordsSensor(SensorEntity):
    """Exposes one zone's geometry/config to the frontend via attributes."""

    _attr_should_poll = False
    _attr_icon = "mdi:vector-rectangle"
    _attr_has_entity_name = True

    def __init__(
        self, hass: HomeAssistant, store: ZoneStore, device_id: str, zone_id: int
    ) -> None:
        """Initialize from the store; state is the zone id."""
        self._store = store
        self._device_id = device_id
        self._zone_id = zone_id
        self._attr_name = f"Zone {zone_id}"
        self._attr_unique_id = f"{device_id}_zone_{zone_id}"
        # Set before the entity reaches the platform so the registry entry is
        # created already linked to the radar. Attaching afterwards would leave
        # the first entity id and friendly name derived from a device-less
        # entity, which is what this rework exists to stop.
        self.device_entry = dr.async_get(hass).async_get(device_id)
        if self.device_entry is None:
            _LOGGER.warning(
                "Apollo mmWave: zone %s is stored against device %s, which no"
                " longer exists. Its sensor will not appear on any device page;"
                " re-draw the zone on the radar's card.",
                zone_id,
                device_id,
            )

    @property
    def native_value(self) -> int:
        """Return the zone id as the state."""
        return self._zone_id

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return shape/data plus the device-wide entities and rotation."""
        device = self._store.device(self._device_id)
        zone_def = self._store.zone(self._device_id, self._zone_id) or {}
        attrs: dict[str, Any] = {
            ATTR_SHAPE: zone_def.get(ATTR_SHAPE),
            ATTR_DATA: zone_def.get(ATTR_DATA),
            "entities": device.get(STORE_ENTITIES, []),
        }
        rotation = device.get(ATTR_ROTATION_DEG)
        if rotation is not None:
            attrs[ATTR_ROTATION_DEG] = rotation
        name = zone_def.get(ATTR_NAME)
        if isinstance(name, str) and name:
            attrs[ATTR_NAME] = name
        return attrs

    async def async_added_to_hass(self) -> None:
        """Refresh whenever this device's zones change."""

        @callback
        def _zones_updated(device_id: str) -> None:
            if device_id == self._device_id:
                self.async_write_ha_state()

        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_ZONES_UPDATED, _zones_updated)
        )
