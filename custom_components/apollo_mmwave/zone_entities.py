"""
Keeping one entity per stored zone, per platform, including after a failed add.

Both platforms used to remember a zone as "added" the moment its entity was
handed to ``async_add_entities``. That call reports nothing back: an entity the
platform refused (the entity id still held by a sibling that was deleted a
moment earlier and has not finished removing itself, say) was logged by Home
Assistant and then never tried again, so the zone sat without an entity until
the next reload. The tracker here learns the outcome from the entity itself:
``async_added_to_hass`` marks it live, ``add_to_platform_abort`` marks the
attempt dead, and a dead attempt is retried on the next zone signal, with one
more nudge when the entity that was in the way finishes leaving.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from homeassistant.core import callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import (
    async_dispatcher_connect,
    async_dispatcher_send,
)

from .const import DOMAIN, SIGNAL_ZONES_UPDATED, STORE_ZONES

if TYPE_CHECKING:
    from collections.abc import Callable

    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import HomeAssistant
    from homeassistant.helpers.entity import Entity
    from homeassistant.helpers.entity_platform import AddEntitiesCallback

ZoneKey = tuple[str, int]


class ZoneEntityTracker:
    """Which zones have an entity that is live, or one still being added."""

    def __init__(self, hass: HomeAssistant, domain: str) -> None:
        """Track one platform's zone entities."""
        self._hass = hass
        self._domain = domain
        self._live: set[ZoneKey] = set()
        self._pending: dict[ZoneKey, ZoneEntityMixin] = {}

    def needs_entity(self, key: ZoneKey) -> bool:
        """Report whether a zone has no entity and none on the way."""
        if key in self._live:
            return False
        pending = self._pending.get(key)
        return pending is None or pending.add_aborted

    def is_disabled(self, unique_id: str) -> bool:
        """Report whether the user disabled this entity in the registry."""
        # The platform refuses a disabled entity on purpose; re-creating it on
        # every zone change would be churn for nothing.
        registry = er.async_get(self._hass)
        entity_id = registry.async_get_entity_id(self._domain, DOMAIN, unique_id)
        if entity_id is None:
            return False
        entry = registry.async_get(entity_id)
        return entry is not None and entry.disabled

    def mark_pending(self, key: ZoneKey, entity: ZoneEntityMixin) -> None:
        """Record an entity handed to the platform."""
        self._pending[key] = entity

    def mark_live(self, key: ZoneKey) -> None:
        """Record that the platform accepted the entity."""
        self._pending.pop(key, None)
        self._live.add(key)

    def mark_gone(self, key: ZoneKey) -> None:
        """Record that the entity left (zone deleted, or entry unloading)."""
        self._live.discard(key)

    def forget(self, keys: set[ZoneKey]) -> None:
        """Drop attempts for zones that are no longer stored."""
        for key in list(self._pending):
            if key not in keys:
                del self._pending[key]

    @property
    def has_aborted(self) -> bool:
        """Report whether any add attempt was refused and awaits a retry."""
        return any(entity.add_aborted for entity in self._pending.values())


class ZoneEntityMixin:
    """The hooks a zone entity gives its tracker. Mix in before the HA base."""

    _tracker: ZoneEntityTracker
    _zone_key: ZoneKey
    add_aborted = False

    def _attach_tracker(self, tracker: ZoneEntityTracker, key: ZoneKey) -> None:
        self._tracker = tracker
        self._zone_key = key

    def add_to_platform_abort(self) -> None:
        """Mark the add as refused so the next zone signal retries it."""
        self.add_aborted = True
        super().add_to_platform_abort()  # type: ignore[misc]

    async def async_added_to_hass(self) -> None:
        """Report the add as done."""
        self._tracker.mark_live(self._zone_key)
        await super().async_added_to_hass()  # type: ignore[misc]

    async def async_will_remove_from_hass(self) -> None:
        """Report the removal, and let a refused sibling try again."""
        self._tracker.mark_gone(self._zone_key)
        await super().async_will_remove_from_hass()  # type: ignore[misc]
        # This entity may be exactly what stood in the refused one's way (a
        # deleted zone whose id was re-drawn before it had finished leaving).
        if self._tracker.has_aborted:
            device_id, _zone_id = self._zone_key
            hass: HomeAssistant = self.hass  # type: ignore[attr-defined]
            async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)


@callback
def async_setup_zone_platform(
    hass: HomeAssistant,
    entry: ConfigEntry,
    domain: str,
    factory: Callable[[str, int], Any],
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Create one entity per stored zone now, and for zones added later."""
    from . import get_store  # noqa: PLC0415 - avoid a module import cycle

    store = get_store(hass)
    tracker = ZoneEntityTracker(hass, domain)

    def _sync_entities() -> None:
        current = {
            (device_id, zone_id)
            for device_id, device in store.devices.items()
            for zone_id in device[STORE_ZONES]
        }
        # A deleted zone's entity is removed through the registry; forgetting
        # its attempt here is what lets a re-drawn zone id get a fresh one.
        tracker.forget(current)
        new_entities: list[Entity] = []
        for key in sorted(current):
            if not tracker.needs_entity(key):
                continue
            entity = factory(*key)
            if tracker.is_disabled(entity.unique_id):
                continue
            entity._attach_tracker(tracker, key)  # noqa: SLF001 - our own mixin
            tracker.mark_pending(key, entity)
            new_entities.append(entity)
        if new_entities:
            async_add_entities(new_entities)

    @callback
    def _zones_updated(_device_id: str) -> None:
        _sync_entities()

    entry.async_on_unload(
        async_dispatcher_connect(hass, SIGNAL_ZONES_UPDATED, _zones_updated)
    )
    _sync_entities()
