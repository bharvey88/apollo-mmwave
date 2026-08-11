"""
One-time migration from the legacy (pre-1.2.0) persistence model.

Legacy model: zone data lived in ``hass.data`` and survived restarts only via
the coordinate sensor's RestoreEntity attributes; the set of zones was
re-derived at boot by parsing entity friendly names. 1.2.0 moves the source of
truth into ``ZoneStore`` (``.storage/apollo_mmwave.zones``).

This module runs only when no store file exists yet: it rebuilds each
location's zones/entities/rotation from the entity registry plus the
restore-state cache of the old coordinate sensors.
"""

from __future__ import annotations

import logging
from contextlib import suppress
from typing import TYPE_CHECKING, Any

from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import restore_state

from .const import (
    ATTR_DATA,
    ATTR_NAME,
    ATTR_ROTATION_DEG,
    ATTR_SHAPE,
    DOMAIN,
    STORE_ENTITIES,
    STORE_ZONES,
)

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

    from .store import ZoneStore

_LOGGER = logging.getLogger(__name__)

_LEGACY_NAME_PREFIX = "Zone Mapper "
_LEGACY_NAME_ZONE_SEP = " Zone "


def _parse_sensor_unique_id(unique_id: str) -> tuple[str, int] | None:
    """Split a coordinate-sensor unique_id into (location_slug, zone_id)."""
    if not unique_id.startswith(f"{DOMAIN}_") or "_zone_" not in unique_id:
        return None
    if unique_id.endswith("_presence"):
        return None
    slug_and_zone = unique_id[len(f"{DOMAIN}_") :]
    slug, _, zone_str = slug_and_zone.rpartition("_zone_")
    try:
        return slug, int(zone_str)
    except (TypeError, ValueError):
        return None


def _derive_location_name(entry: er.RegistryEntry, fallback_slug: str) -> str:
    """Recover the display location from the legacy friendly name."""
    for candidate in (entry.original_name, entry.name):
        if not isinstance(candidate, str):
            continue
        if not candidate.startswith(_LEGACY_NAME_PREFIX):
            continue
        if _LEGACY_NAME_ZONE_SEP not in candidate:
            continue
        location = candidate[
            len(_LEGACY_NAME_PREFIX) : candidate.rfind(_LEGACY_NAME_ZONE_SEP)
        ]
        if location:
            return location
    return fallback_slug


def _restored_attributes(hass: HomeAssistant, entity_id: str) -> dict[str, Any] | None:
    stored = restore_state.async_get(hass).last_states.get(entity_id)
    if stored is None:
        return None
    attributes = stored.state.attributes
    return dict(attributes) if attributes else None


def _normalize_entity_pairs(pairs: Any) -> list[dict[str, str]]:
    if not isinstance(pairs, list):
        return []
    normalized: list[dict[str, str]] = []
    for pair in pairs:
        if not isinstance(pair, dict):
            continue
        x_id = pair.get("x")
        y_id = pair.get("y")
        if isinstance(x_id, str) and isinstance(y_id, str):
            normalized.append({"x": x_id, "y": y_id})
    return normalized


async def async_migrate_legacy(hass: HomeAssistant, store: ZoneStore) -> None:
    """Populate an empty store from legacy restore states, then persist it."""
    registry = er.async_get(hass)
    migrated_zones = 0

    for entry in list(registry.entities.values()):
        if entry.platform != DOMAIN:
            continue

        # The restore-state cache is keyed by the entity_id the state was
        # saved under.
        attributes = _restored_attributes(hass, entry.entity_id) or {}

        if entry.domain != "sensor":
            continue
        parsed = _parse_sensor_unique_id(entry.unique_id or "")
        if not parsed:
            continue
        slug, zone_id = parsed
        location = _derive_location_name(entry, slug)
        # The store is keyed by device id and this legacy data only knows a
        # display name, so it goes to orphans, the same place the v1 store
        # migration puts locations it cannot resolve. Nothing here resolves a
        # device yet; that arrives with the rewrite of this module.
        loc = store.orphans.setdefault(location, {STORE_ZONES: {}, STORE_ENTITIES: []})
        shape = attributes.get(ATTR_SHAPE)
        if shape is not None:
            zone_def: dict[str, Any] = {
                ATTR_SHAPE: shape,
                ATTR_DATA: attributes.get(ATTR_DATA),
            }
            name = attributes.get(ATTR_NAME)
            if isinstance(name, str) and name:
                zone_def[ATTR_NAME] = name
            loc[STORE_ZONES][zone_id] = zone_def
        else:
            # Zone exists in the registry but its data didn't survive; keep a
            # placeholder so the entities are recreated and can be redrawn.
            loc[STORE_ZONES].setdefault(zone_id, {})

        entities = _normalize_entity_pairs(attributes.get(STORE_ENTITIES))
        if entities:
            loc[STORE_ENTITIES] = entities
        rotation = attributes.get(ATTR_ROTATION_DEG)
        if rotation is not None and ATTR_ROTATION_DEG not in loc:
            with suppress(TypeError, ValueError):
                loc[ATTR_ROTATION_DEG] = round(float(rotation))
        migrated_zones += 1

    if migrated_zones:
        _LOGGER.info(
            "Apollo mmWave: migrated %d legacy zone sensor(s) into the store",
            migrated_zones,
        )
    await store.async_save()
