"""
One-time migrations run at setup, before any platform is forwarded.

``async_migrate_legacy`` covers the pre-1.2.0 persistence model, where zone
data lived in ``hass.data`` and survived restarts only via the coordinate
sensor's RestoreEntity attributes, with the set of zones re-derived at boot by
parsing entity friendly names. 1.2.0 moved the source of truth into
``ZoneStore`` (``.storage/apollo_mmwave.zones``). It runs only when no store
file exists yet.

``async_migrate_unique_ids`` covers the 2.0 identity change: zone entities are
keyed by Home Assistant device id now instead of a slug of the radar's display
name. It runs on every setup and is a no-op once there is nothing left in the
old format.
"""

from __future__ import annotations

import logging
import re
from contextlib import suppress
from typing import TYPE_CHECKING, Any

from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import restore_state
from homeassistant.util import slugify

from .const import (
    ATTR_DATA,
    ATTR_NAME,
    ATTR_ROTATION_DEG,
    ATTR_SHAPE,
    DOMAIN,
    STORE_ENTITIES,
    STORE_LABEL,
    STORE_ZONES,
)
from .store import _resolve_device_id

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


def _legacy_target(
    hass: HomeAssistant,
    store: ZoneStore,
    location: str,
    entities: Any,
    warned: set[str],
) -> dict[str, Any]:
    """Return the store entry a legacy location belongs in."""
    # The store is keyed by device id, so legacy data has to be resolved the same
    # way v1 store data is: by the coordinate entities it tracked, then by name.
    # What resolves to nothing goes to orphans rather than being dropped, so a
    # user who renamed their radar keeps their drawn zones.
    device_id = _resolve_device_id(hass, location, entities)
    if device_id is not None:
        target = store.device(device_id)
    else:
        if location not in warned:
            warned.add(location)
            _LOGGER.warning(
                "Apollo mmWave: legacy zone location '%s' matches no Home"
                " Assistant device; its zones were kept but are not shown until"
                " you re-draw them on the device's card.",
                location,
            )
        target = store.orphans.setdefault(location, {STORE_ZONES: {}})
    target.setdefault(STORE_LABEL, location)
    return target


async def async_migrate_legacy(hass: HomeAssistant, store: ZoneStore) -> None:
    """Populate an empty store from legacy restore states, then persist it."""
    registry = er.async_get(hass)
    migrated_zones = 0
    # One warning per location, not one per zone entity on it.
    warned: set[str] = set()

    for entry in list(registry.entities.values()):
        if entry.platform != DOMAIN:
            continue

        attributes = _restored_attributes(hass, entry.entity_id) or {}

        if entry.domain != "sensor":
            continue
        parsed = _parse_sensor_unique_id(entry.unique_id or "")
        if not parsed:
            continue
        slug, zone_id = parsed
        location = _derive_location_name(entry, slug)
        loc = _legacy_target(
            hass, store, location, attributes.get(STORE_ENTITIES), warned
        )
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


_OLD_UID = re.compile(
    rf"^{DOMAIN}_(?P<slug>.+)_zone_(?P<zone>\d+)(?P<presence>_presence)?$"
)


async def async_migrate_unique_ids(hass: HomeAssistant, store: ZoneStore) -> None:
    """
    Point pre-2.0 zone entities at their device-id unique ids.

    Entity ids are deliberately left alone: they are no longer derived from
    anything, and rewriting them would break the very automations this
    migration exists to keep working. Only the unique id changes, so the
    platform adopts the user's existing entity along with its name, area, and
    every reference to it.
    """
    registry = er.async_get(hass)
    # The v1 store keyed everything by display name and the old unique ids were
    # built from a slug of it, so `label` is the only bridge back to a device.
    slug_to_device = {
        slugify(entry[STORE_LABEL]): device_id
        for device_id, entry in store.devices.items()
        if isinstance(entry.get(STORE_LABEL), str)
    }
    if not slug_to_device:
        return

    for entity in list(registry.entities.values()):
        if entity.platform != DOMAIN:
            continue
        match = _OLD_UID.match(entity.unique_id or "")
        if not match:
            continue
        device_id = slug_to_device.get(match["slug"])
        if device_id is None:
            continue
        suffix = "_presence" if match["presence"] else ""
        new_uid = f"{device_id}_zone_{match['zone']}{suffix}"
        occupant = registry.async_get_entity_id(entity.domain, DOMAIN, new_uid)
        if occupant is not None:
            # Two entities cannot share a unique id, and the occupant is the one
            # the platform is already driving. Renaming onto it would raise, and
            # removing either side would throw away a user's entity, so the old
            # one is left in place and named so the user can delete it.
            _LOGGER.warning(
                "Apollo mmWave: %s could not be migrated to unique id %s because"
                " %s already uses it; %s is stale and can be deleted.",
                entity.entity_id,
                new_uid,
                occupant,
                entity.entity_id,
            )
            continue
        registry.async_update_entity(entity.entity_id, new_unique_id=new_uid)
