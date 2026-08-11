"""
LD2450 tracking-radar target sensors for a device.

The LD2450 in R_PRO-1 and MTR-1 reports moving-target positions as one X and
one Y sensor per target, named ``sensor.<base>_ld2450_target_<n>_x`` / ``_y``
by the firmware. Resolving those from the entity registry is what lets the
card stop asking the user to hand-pick them.

Matching is on the entity id suffix rather than the whole id, so a renamed
prefix does not break detection, and the optional trailing ``_2`` absorbs Home
Assistant's dedup suffix. The target number sits before those dedup digits, so
it cannot be misread as one.

This is the Python twin of ``frontend-src/src/ld2450.ts``. The two regexes and
the pairing rule (an X is only offered with the Y of the same target number)
are shared, so change both together.

One difference is deliberate: this side drops disabled entities, the TypeScript
does not. It cannot. It reads ``hass.entities``, which carries no reliable
disabled signal, while this reads the entity registry, which does. So a target
whose Y is disabled yields a pair there and nothing here. Do not "fix" that by
loosening this side. From Task 6 on, the backend is the authoritative source of
suggested pairs and the stricter answer is the correct one.

``effective_target_pairs`` is the one answer to "which pairs does this zone
use", shared by both platforms so the geometry sensor cannot advertise a
different list from the one its own presence sensor is tracking.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import DATA_PAIR_CACHE, DOMAIN, SIGNAL_ZONES_UPDATED, STORE_ENTITIES

if TYPE_CHECKING:
    from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant

    from .store import ZoneStore

TARGET_X = re.compile(r"_ld2450_target_(\d+)_x(?:_\d+)?$")
TARGET_Y = re.compile(r"_ld2450_target_(\d+)_y(?:_\d+)?$")


def resolve_target_pairs(hass: HomeAssistant, device_id: str) -> list[dict[str, str]]:
    """Return the device's LD2450 X/Y sensor pairs, ordered by target number."""
    xs: dict[int, str] = {}
    ys: dict[int, str] = {}
    for entry in er.async_entries_for_device(
        er.async_get(hass), device_id, include_disabled_entities=False
    ):
        if entry.domain != "sensor":
            continue
        object_id = entry.entity_id.partition(".")[2]
        if match := TARGET_X.search(object_id):
            # First writer wins: a duplicate target number is a misnamed entity,
            # and the registry's own order is the closest thing to canonical.
            xs.setdefault(int(match.group(1)), entry.entity_id)
        elif match := TARGET_Y.search(object_id):
            ys.setdefault(int(match.group(1)), entry.entity_id)
    # A half-present target (Y disabled, say) has no drawable position, so it is
    # dropped rather than returned incomplete.
    return [{"x": xs[n], "y": ys[n]} for n in sorted(xs) if n in ys]


def effective_target_pairs(
    hass: HomeAssistant, store: ZoneStore, device_id: str
) -> list[dict[str, str]]:
    """Return the pairs a device's zones track, configured or resolved."""
    configured = store.device(device_id).get(STORE_ENTITIES)
    # Absent means never configured, so the radar's own targets stand in. An
    # empty list is the user having cleared it, and clearing means nothing.
    if configured is not None:
        return configured if isinstance(configured, list) else []
    cache = hass.data.get(DOMAIN, {}).get(DATA_PAIR_CACHE)
    if cache is None:
        return resolve_target_pairs(hass, device_id)
    if device_id not in cache:
        # Cached because presence re-reads this on every coordinate update, and
        # the LD2450 pushes several a second per target, while resolving scans
        # the device's whole entity list with a regex.
        cache[device_id] = resolve_target_pairs(hass, device_id)
    return cache[device_id]


@callback
def async_track_target_pairs(hass: HomeAssistant) -> CALLBACK_TYPE:
    """Keep resolved pairs fresh, and republish a device's zones when they move."""
    cache: dict[str, list[dict[str, str]]] = {}
    hass.data.setdefault(DOMAIN, {})[DATA_PAIR_CACHE] = cache

    @callback
    def _invalidate(device_ids: list[str]) -> None:
        for device_id in device_ids:
            del cache[device_id]
            # Both platforms already refresh on this signal, so reusing it keeps
            # the geometry sensor and its presence sensor in step by
            # construction rather than by two parallel subscriptions.
            async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)

    @callback
    def _registry_updated(event: Event[Any]) -> None:
        entity_id = event.data["entity_id"]
        entry = er.async_get(hass).async_get(entity_id)
        if entry is not None and entry.device_id in cache:
            _invalidate([entry.device_id])
            return
        # A removed entity has no entry left to point at its device, so ask the
        # cache which devices were relying on it.
        _invalidate(
            [
                device_id
                for device_id, pairs in cache.items()
                if any(entity_id in (pair["x"], pair["y"]) for pair in pairs)
            ]
        )

    @callback
    def _started(_event: Event[Any]) -> None:
        _invalidate(list(cache))

    unsub_registry = hass.bus.async_listen(
        er.EVENT_ENTITY_REGISTRY_UPDATED, _registry_updated
    )
    unsub_started = hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _started)

    @callback
    def _unsubscribe() -> None:
        unsub_registry()
        unsub_started()
        hass.data.get(DOMAIN, {}).pop(DATA_PAIR_CACHE, None)

    return _unsubscribe
