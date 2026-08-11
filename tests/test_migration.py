"""Migrations: legacy (pre-1.2.0) restore states, and pre-2.0 unique ids."""

from __future__ import annotations

from homeassistant.core import State
from homeassistant.helpers import entity_registry as er
from homeassistant.util import slugify
from pytest_homeassistant_custom_component.common import mock_restore_cache

from custom_components.apollo_mmwave import get_store
from custom_components.apollo_mmwave.const import DOMAIN, STORE_ZONES
from custom_components.apollo_mmwave.migration import async_migrate_unique_ids
from custom_components.apollo_mmwave.store import ZoneStore

from .conftest import RADAR_NAME, setup_integration

TARGET_X = "sensor.r_pro_ld2450_target_1_x"
TARGET_Y = "sensor.r_pro_ld2450_target_1_y"

LEGACY_ATTRS = {
    "shape": "rect",
    "data": {"x_min": -500, "x_max": 500, "y_min": 0, "y_max": 1500},
    "entities": [{"x": TARGET_X, "y": TARGET_Y}],
    "rotation_deg": 15,
    "name": "Desk",
}

OLD_ZONE_UID = f"{DOMAIN}_{slugify(RADAR_NAME)}_zone_1"
OLD_PRESENCE_UID = f"{OLD_ZONE_UID}_presence"


def _register_legacy_entities(hass, slug: str = "office") -> None:
    registry = er.async_get(hass)
    # Legacy friendly names slugged into zone_mapper_* entity ids, while the
    # vendored card constructs apollo_mmwave_* ids, so these never matched.
    registry.async_get_or_create(
        "sensor",
        DOMAIN,
        f"{DOMAIN}_{slug}_zone_1",
        suggested_object_id=f"zone_mapper_{slug}_zone_1",
        original_name=f"Zone Mapper {slug.title()} Zone 1",
    )
    registry.async_get_or_create(
        "binary_sensor",
        DOMAIN,
        f"{DOMAIN}_{slug}_zone_1_presence",
        suggested_object_id=f"{slug}_zone_1_presence",
        original_name=f"{slug.title()} Zone 1 Presence",
    )


async def _v1_store(hass, hass_storage, location: str) -> ZoneStore:
    """Load a store from a v1 payload, so `label` is set the real way."""
    hass_storage[f"{DOMAIN}.zones"] = {
        "version": 1,
        "data": {
            "locations": {
                location: {"zones": {"1": {"shape": "rect", "data": {}}}},
            }
        },
    }
    store = ZoneStore(hass)
    assert await store.async_load() is True
    return store


async def test_migrates_restore_state_into_store(
    hass, config_entry, esphome_device
) -> None:
    """Legacy zone data lands on the device its tracked entities belong to."""
    _ = esphome_device
    _register_legacy_entities(hass)
    mock_restore_cache(
        hass, [State("sensor.zone_mapper_office_zone_1", "1", LEGACY_ATTRS)]
    )

    await setup_integration(hass, config_entry)

    entry = get_store(hass).devices[esphome_device.id]
    assert entry[STORE_ZONES][1]["shape"] == "rect"
    assert entry[STORE_ZONES][1]["name"] == "Desk"
    assert entry["entities"] == [{"x": TARGET_X, "y": TARGET_Y}]
    assert entry["rotation_deg"] == 15
    assert entry["label"] == "Office"


async def test_legacy_zones_with_no_matching_device_are_kept_as_orphans(
    hass, config_entry, caplog
) -> None:
    """A legacy location matching nothing is preserved, not silently dropped."""
    _register_legacy_entities(hass)
    mock_restore_cache(
        hass,
        [
            State(
                "sensor.zone_mapper_office_zone_1",
                "1",
                {**LEGACY_ATTRS, "entities": []},
            )
        ],
    )

    await setup_integration(hass, config_entry)

    assert get_store(hass).orphans["Office"][STORE_ZONES][1]["shape"] == "rect"
    assert any(
        record.levelname == "WARNING" and "Office" in record.message
        for record in caplog.records
    )


async def test_legacy_entity_ids_are_left_alone(
    hass, config_entry, esphome_device
) -> None:
    """Entity ids are nobody's contract now, so migration must not rewrite them."""
    _ = esphome_device
    _register_legacy_entities(hass)
    mock_restore_cache(
        hass, [State("sensor.zone_mapper_office_zone_1", "1", LEGACY_ATTRS)]
    )

    await setup_integration(hass, config_entry)

    registry = er.async_get(hass)
    assert (
        registry.async_get_entity_id("sensor", DOMAIN, f"{esphome_device.id}_zone_1")
        == "sensor.zone_mapper_office_zone_1"
    )


async def test_migration_skipped_when_store_exists(
    hass, config_entry, hass_storage
) -> None:
    """An existing store wins; legacy restore states are ignored."""
    hass_storage[f"{DOMAIN}.zones"] = {
        "version": 1,
        "data": {"locations": {}},
    }
    _register_legacy_entities(hass)
    mock_restore_cache(
        hass, [State("sensor.zone_mapper_office_zone_1", "1", LEGACY_ATTRS)]
    )

    await setup_integration(hass, config_entry)

    store = get_store(hass)
    assert store.devices == {}
    assert store.orphans == {}


async def test_existing_zone_entities_keep_their_entity_id_and_customizations(
    hass, hass_storage, entity_registry, esphome_device
) -> None:
    """A renamed pre-2.0 zone entity keeps its id and its custom name."""
    old = entity_registry.async_get_or_create(
        "sensor",
        DOMAIN,
        OLD_ZONE_UID,
        suggested_object_id=OLD_ZONE_UID,
    )
    entity_registry.async_update_entity(old.entity_id, name="Couch")
    store = await _v1_store(hass, hass_storage, RADAR_NAME)

    await async_migrate_unique_ids(hass, store)

    migrated = entity_registry.async_get(old.entity_id)
    assert migrated.unique_id == f"{esphome_device.id}_zone_1"
    assert migrated.name == "Couch"
    assert migrated.entity_id == old.entity_id


async def test_presence_unique_ids_migrate_too(
    hass, hass_storage, entity_registry, esphome_device
) -> None:
    """The presence suffix has to survive the rewrite, not be swallowed."""
    old = entity_registry.async_get_or_create(
        "binary_sensor",
        DOMAIN,
        OLD_PRESENCE_UID,
        suggested_object_id=OLD_PRESENCE_UID,
    )
    store = await _v1_store(hass, hass_storage, RADAR_NAME)

    await async_migrate_unique_ids(hass, store)

    assert (
        entity_registry.async_get(old.entity_id).unique_id
        == f"{esphome_device.id}_zone_1_presence"
    )


async def test_migration_leaves_an_occupied_unique_id_alone(
    hass, hass_storage, entity_registry, esphome_device, caplog
) -> None:
    """The live entity wins; the stale duplicate is reported, never clobbered."""
    existing = entity_registry.async_get_or_create(
        "sensor",
        DOMAIN,
        f"{esphome_device.id}_zone_1",
        suggested_object_id="zone_1",
    )
    old = entity_registry.async_get_or_create(
        "sensor",
        DOMAIN,
        OLD_ZONE_UID,
        suggested_object_id=OLD_ZONE_UID,
    )
    store = await _v1_store(hass, hass_storage, RADAR_NAME)

    await async_migrate_unique_ids(hass, store)

    assert entity_registry.async_get(old.entity_id).unique_id == OLD_ZONE_UID
    assert (
        entity_registry.async_get(existing.entity_id).unique_id
        == f"{esphome_device.id}_zone_1"
    )
    warnings = [
        record.message
        for record in caplog.records
        if record.levelname == "WARNING" and old.entity_id in record.message
    ]
    assert warnings, "expected a warning naming the stale entity"
    assert existing.entity_id in warnings[0]


async def test_unknown_slug_is_left_alone(
    hass, hass_storage, entity_registry, esphome_device
) -> None:
    """A zone entity from some other radar must not be rehomed onto this one."""
    _ = esphome_device
    old = entity_registry.async_get_or_create(
        "sensor",
        DOMAIN,
        f"{DOMAIN}_some_other_radar_zone_1",
        suggested_object_id="some_other_radar_zone_1",
    )
    store = await _v1_store(hass, hass_storage, RADAR_NAME)

    await async_migrate_unique_ids(hass, store)

    assert (
        entity_registry.async_get(old.entity_id).unique_id
        == f"{DOMAIN}_some_other_radar_zone_1"
    )


async def test_other_integrations_entities_are_left_alone(
    hass, hass_storage, entity_registry, esphome_device
) -> None:
    """Only our own platform's entities are ours to rewrite."""
    _ = esphome_device
    foreign = entity_registry.async_get_or_create(
        "sensor",
        "zone_mapper",
        f"{DOMAIN}_{slugify(RADAR_NAME)}_zone_1",
        suggested_object_id="zone_mapper_zone_1",
    )
    store = await _v1_store(hass, hass_storage, RADAR_NAME)

    await async_migrate_unique_ids(hass, store)

    assert (
        entity_registry.async_get(foreign.entity_id).unique_id
        == f"{DOMAIN}_{slugify(RADAR_NAME)}_zone_1"
    )


async def test_setup_migrates_unique_ids_before_entities_are_created(
    hass, config_entry, hass_storage, entity_registry, esphome_device
) -> None:
    """End to end: an upgraded install adopts its old entities, not fresh ones."""
    old = entity_registry.async_get_or_create(
        "sensor",
        DOMAIN,
        OLD_ZONE_UID,
        suggested_object_id=OLD_ZONE_UID,
    )
    entity_registry.async_update_entity(old.entity_id, name="Couch")
    hass_storage[f"{DOMAIN}.zones"] = {
        "version": 1,
        "data": {
            "locations": {
                RADAR_NAME: {
                    "zones": {"1": {"shape": "rect", "data": {}}},
                }
            }
        },
    }

    await setup_integration(hass, config_entry)

    assert (
        entity_registry.async_get_entity_id(
            "sensor", DOMAIN, f"{esphome_device.id}_zone_1"
        )
        == old.entity_id
    )
    assert entity_registry.async_get(old.entity_id).name == "Couch"
