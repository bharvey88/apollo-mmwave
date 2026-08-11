"""
One-time migrations run at setup, before any platform is forwarded.

``async_migrate_legacy`` covers the pre-1.2.0 persistence model, where zone
data lived in ``hass.data`` and survived restarts only via the coordinate
sensor's RestoreEntity attributes, with the set of zones re-derived at boot by
parsing entity friendly names. 1.2.0 moved the source of truth into
``ZoneStore`` (``.storage/apollo_mmwave.zones``). It runs only when no store
file exists yet.

``async_import_zone_mapper`` covers the other upgrade path onto 1.2.0+: users
who ran the two-piece ``zone_mapper`` integration plus the standalone card.
This one imports rather than migrates, because that integration is a separate
install that may still be running, so nothing it owns is touched. It runs in
the same "no store file yet" window as ``async_migrate_legacy``.

``async_migrate_unique_ids`` covers the 2.0 identity change: zone entities are
keyed by Home Assistant device id now instead of a slug of the radar's display
name. It runs on every setup rather than once, because the zone locations it
needs may only become resolvable later; it rewrites nothing once every entity
is on the new format and no orphan resolves.
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
    STORE_ORPHANS,
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


def _collect_legacy_locations(
    hass: HomeAssistant, registry: er.EntityRegistry
) -> dict[str, list[tuple[int, dict[str, Any]]]]:
    """Group legacy zone sensors by the display location they belonged to."""
    locations: dict[str, list[tuple[int, dict[str, Any]]]] = {}
    for entry in list(registry.entities.values()):
        if entry.platform != DOMAIN or entry.domain != "sensor":
            continue
        parsed = _parse_sensor_unique_id(entry.unique_id or "")
        if parsed is None:
            continue
        slug, zone_id = parsed
        location = _derive_location_name(entry, slug)
        attributes = _restored_attributes(hass, entry.entity_id) or {}
        locations.setdefault(location, []).append((zone_id, attributes))
    return locations


def _location_pairs(
    records: list[tuple[int, dict[str, Any]]],
) -> list[dict[str, str]] | None:
    """First tracked pair list found on any of a location's zones."""
    for _zone_id, attributes in records:
        pairs = _normalize_entity_pairs(attributes.get(STORE_ENTITIES))
        if pairs:
            return pairs
    return None


def _legacy_zone_definition(attributes: dict[str, Any]) -> dict[str, Any]:
    """Build a zone definition, or an empty placeholder if data was lost."""
    shape = attributes.get(ATTR_SHAPE)
    if shape is None:
        # Zone exists in the registry but its data didn't survive; a placeholder
        # keeps the entities so they are recreated and can be redrawn.
        return {}
    zone_def: dict[str, Any] = {ATTR_SHAPE: shape, ATTR_DATA: attributes.get(ATTR_DATA)}
    name = attributes.get(ATTR_NAME)
    if isinstance(name, str) and name:
        zone_def[ATTR_NAME] = name
    return zone_def


def _merge_legacy_location(
    target: dict[str, Any],
    records: list[tuple[int, dict[str, Any]]],
    location: str,
    zone_sources: dict[int, str],
) -> None:
    """
    Fold one legacy location into a store entry, first writer wins.

    Two locations can resolve to the same device, which is what a mid-life
    rename leaves behind, so a bare assignment would let the second one silently
    wipe the first one's geometry and custom names. This migration runs once
    with no undo, so every zone id is kept and only true conflicts are dropped,
    loudly. Empty placeholders do not count as writers: real data replaces one.

    Mirrors ``store._merge_location``. Kept separate because that one writes
    string zone keys into a payload that is parsed later, while this writes
    straight into a live store, where zone ids are ints.
    """
    zones = target[STORE_ZONES]
    for zone_id, attributes in records:
        zone_def = _legacy_zone_definition(attributes)
        if zones.get(zone_id):
            if zone_def:
                _LOGGER.warning(
                    "Apollo mmWave: legacy zone %s is defined by both '%s' and"
                    " '%s', which migrated to the same device; keeping the"
                    " definition from '%s'.",
                    zone_id,
                    zone_sources.get(zone_id, location),
                    location,
                    zone_sources.get(zone_id, location),
                )
            continue
        zones[zone_id] = zone_def
        zone_sources[zone_id] = location

    for _zone_id, attributes in records:
        # Never seeded and never set from an empty list: absent means the user
        # never picked coordinate sensors, which is not the same as clearing it.
        if target.get(STORE_ENTITIES) is None:
            pairs = _normalize_entity_pairs(attributes.get(STORE_ENTITIES))
            if pairs:
                target[STORE_ENTITIES] = pairs
        # 0 degrees is a configured value, distinct from absent.
        if target.get(ATTR_ROTATION_DEG) is None:
            rotation = attributes.get(ATTR_ROTATION_DEG)
            if rotation is not None:
                with suppress(TypeError, ValueError):
                    target[ATTR_ROTATION_DEG] = round(float(rotation))


async def async_migrate_legacy(hass: HomeAssistant, store: ZoneStore) -> None:
    """Populate an empty store from legacy restore states, then persist it."""
    locations = _collect_legacy_locations(hass, er.async_get(hass))
    # Which location contributed each zone id, per target, so a collision
    # warning can name both sides of it.
    sources: dict[str, dict[int, str]] = {}
    migrated_zones = 0

    for location, records in locations.items():
        # Resolved once per location, not once per zone. All of a location's
        # zones belong on one device, and a zone whose restore data was lost
        # carries no tracked pairs to resolve by, so resolving zone by zone
        # would drop that one through to the name fallback and could land it on
        # a different device from its siblings, or in orphans on its own.
        device_id = _resolve_device_id(hass, location, _location_pairs(records))
        if device_id is None:
            _LOGGER.warning(
                "Apollo mmWave: legacy zone location '%s' matches no Home"
                " Assistant device; its zones were kept but are not shown until"
                " you re-draw them on the device's card.",
                location,
            )
            target = store.orphans.setdefault(location, {STORE_ZONES: {}})
            # Orphans are keyed by location, so they cannot share a bucket.
            source_key = f"{STORE_ORPHANS}:{location}"
        else:
            target = store.device(device_id)
            source_key = device_id
        target.setdefault(STORE_LABEL, location)
        _merge_legacy_location(
            target, records, location, sources.setdefault(source_key, {})
        )
        migrated_zones += len(records)

    if migrated_zones:
        _LOGGER.info(
            "Apollo mmWave: migrated %d legacy zone sensor(s) into the store",
            migrated_zones,
        )
    await store.async_save()


LEGACY_PLATFORM = "zone_mapper"
_LEGACY_UID = re.compile(rf"^{LEGACY_PLATFORM}_(?P<slug>.+)_zone_(?P<zone>\d+)$")


def _collect_zone_mapper_locations(
    hass: HomeAssistant, registry: er.EntityRegistry
) -> dict[str, list[tuple[int, dict[str, Any]]]]:
    """Group the standalone integration's zone sensors by display location."""
    locations: dict[str, list[tuple[int, dict[str, Any]]]] = {}
    for entity in list(registry.entities.values()):
        if entity.platform != LEGACY_PLATFORM:
            continue
        match = _LEGACY_UID.match(entity.unique_id or "")
        if not match:
            continue
        attributes = _restored_attributes(hass, entity.entity_id) or {}
        # No shape means that zone's data is not in the restore cache. Our own
        # migration keeps an empty placeholder here so the entity behind it is
        # recreated; there is no entity of ours behind this one, so importing an
        # empty zone would only invent one the user never drew.
        if attributes.get(ATTR_SHAPE) is None:
            continue
        location = _derive_location_name(entity, match["slug"])
        locations.setdefault(location, []).append((int(match["zone"]), attributes))
    return locations


async def async_import_zone_mapper(hass: HomeAssistant, store: ZoneStore) -> int:
    """
    Copy zones out of the standalone zone_mapper integration.

    Read-only with respect to that integration: its entities keep their ids and
    its own storage is untouched, so both can run side by side while the user
    checks the import landed. The data lives in the restore-state cache keyed by
    that integration's entity ids, which only exists while its registry entries
    do, so removing it first leaves nothing to import and this returns 0.
    """
    locations = _collect_zone_mapper_locations(hass, er.async_get(hass))
    # Which location contributed each zone id, per device, so a collision
    # warning can name both sides of it.
    sources: dict[str, dict[int, str]] = {}
    imported = 0

    for location, records in locations.items():
        # Resolved per location, not per zone, for the reason spelled out in
        # `async_migrate_legacy`: a location's zones belong on one device.
        device_id = _resolve_device_id(hass, location, _location_pairs(records))
        if device_id is None:
            _LOGGER.warning(
                "Apollo mmWave: could not match zone_mapper location '%s' to a"
                " device; its zones were not imported.",
                location,
            )
            continue
        target = store.device(device_id)
        # Zones already on the device came from our own pre-1.2 migration, which
        # runs first and so wins any collision. Recording where they came from
        # keeps the warning naming both real sides instead of this one twice.
        zone_sources = sources.setdefault(
            device_id,
            {
                zone_id: target.get(STORE_LABEL, location)
                for zone_id in target[STORE_ZONES]
            },
        )
        target.setdefault(STORE_LABEL, location)
        before = len(target[STORE_ZONES])
        # Shared with the pre-1.2 migration because the failure mode is the same:
        # a renamed radar leaves two locations resolving onto one device, and a
        # plain assignment would wipe the first one's geometry and zone names.
        _merge_legacy_location(target, records, location, zone_sources)
        imported += len(target[STORE_ZONES]) - before

    if imported:
        _LOGGER.info("Apollo mmWave: imported %d zone(s) from zone_mapper", imported)
    return imported


_OLD_UID = re.compile(
    rf"^{DOMAIN}_(?P<slug>.+)_zone_(?P<zone>\d+)(?P<presence>_presence)?$"
)


def _merge_promoted_orphan(
    target: dict[str, Any], orphan: dict[str, Any], location: str
) -> None:
    """Fold a promoted orphan into a device entry that already has data."""
    # The entry already on the device resolved outright, so it wins every
    # conflict; the orphan only fills gaps. Same first-writer-wins discipline as
    # everywhere else, and the same rule that an empty placeholder is a gap.
    for zone_id, zone_def in orphan[STORE_ZONES].items():
        if target[STORE_ZONES].get(zone_id):
            _LOGGER.warning(
                "Apollo mmWave: zone %s from '%s' collides with a zone already"
                " on that device; keeping the one already there.",
                zone_id,
                location,
            )
            continue
        target[STORE_ZONES][zone_id] = zone_def
    if target.get(STORE_ENTITIES) is None and orphan.get(STORE_ENTITIES):
        target[STORE_ENTITIES] = orphan[STORE_ENTITIES]
    if (
        target.get(ATTR_ROTATION_DEG) is None
        and orphan.get(ATTR_ROTATION_DEG) is not None
    ):
        target[ATTR_ROTATION_DEG] = orphan[ATTR_ROTATION_DEG]


async def _promote_resolvable_orphans(
    hass: HomeAssistant, store: ZoneStore
) -> dict[str, str]:
    """Move orphan locations onto a device that resolves for them now."""
    # Orphans are resolved once, when the v1 store is read, and then frozen on
    # disk. A user who renamed their radar and never picked coordinate sensors
    # resolves to nothing at that moment: the entity path has nothing to follow
    # and the name fallback misses against the new name. Left there, no `label`
    # ever reaches `devices`, so the unique-id rewrite below matches nothing and
    # their entities are abandoned and recreated, which is the exact outcome
    # this module exists to prevent. This runs on every setup, so a device that
    # resolves later still adopts them. It carries the same mis-match risk as
    # the name fallback it reuses, because it is the same heuristic.
    promoted: dict[str, str] = {}
    for location in list(store.orphans):
        entry = store.orphans[location]
        device_id = _resolve_device_id(hass, location, entry.get(STORE_ENTITIES))
        if device_id is None:
            continue
        orphan = store.orphans.pop(location)
        target = store.devices.get(device_id)
        if target is None:
            store.devices[device_id] = orphan
        else:
            _merge_promoted_orphan(target, orphan, location)
        promoted[location] = device_id
        _LOGGER.info(
            "Apollo mmWave: zone location '%s' now matches a device (%d zone(s));"
            " its zones are live again.",
            location,
            len(orphan[STORE_ZONES]),
        )
    if promoted:
        await store.async_save()
    return promoted


async def async_migrate_unique_ids(hass: HomeAssistant, store: ZoneStore) -> None:
    """
    Point pre-2.0 zone entities at their device-id unique ids.

    Entity ids are deliberately left alone: they are no longer derived from
    anything, and rewriting them would break the very automations this
    migration exists to keep working. Only the unique id changes, so the
    platform adopts the user's existing entity along with its name, area, and
    every reference to it.

    Orphan locations that resolve to a device are promoted first, so an entity
    that gets adopted here is backed by zones the platform can actually read.
    """
    registry = er.async_get(hass)
    promoted = await _promote_resolvable_orphans(hass, store)
    # The v1 store keyed everything by display name and the old unique ids were
    # built from a slug of it, so `label` is the bridge back to a device.
    slug_to_device = {
        slugify(entry[STORE_LABEL]): device_id
        for device_id, entry in store.devices.items()
        if isinstance(entry.get(STORE_LABEL), str)
    }
    # A device can only carry one label, so a promoted location that merged into
    # a device that already had one contributes a second slug for the same id.
    for location, device_id in promoted.items():
        slug_to_device.setdefault(slugify(location), device_id)
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
