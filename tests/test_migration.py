"""Migrations: legacy (pre-1.2.0) restore states, pre-2.0 unique ids, imports."""

from __future__ import annotations

from typing import TYPE_CHECKING

from homeassistant.core import State
from homeassistant.helpers import entity_registry as er
from homeassistant.util import slugify
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    mock_restore_cache,
)

from custom_components.apollo_mmwave import get_store
from custom_components.apollo_mmwave.const import DOMAIN, STORE_ZONES
from custom_components.apollo_mmwave.migration import (
    async_import_zone_mapper,
    async_migrate_unique_ids,
)
from custom_components.apollo_mmwave.store import ZoneStore

from .conftest import RADAR_NAME, setup_integration

if TYPE_CHECKING:
    from homeassistant.helpers.device_registry import DeviceEntry

TARGET_X = "sensor.r_pro_ld2450_target_1_x"
TARGET_Y = "sensor.r_pro_ld2450_target_1_y"

LEGACY_ATTRS = {
    "shape": "rect",
    "data": {"x_min": -500, "x_max": 500, "y_min": 0, "y_max": 1500},
    "entities": [{"x": TARGET_X, "y": TARGET_Y}],
    "rotation_deg": 15,
    "name": "Desk",
}

# zone_mapper is the standalone integration this one replaces. Its zone data
# lives in the same place ours used to: the restore-state attributes of one
# sensor per zone, which is what the shared card reads.
ZONE_MAPPER_ATTRS = {
    "shape": "rect",
    "data": {"x_min": 0, "x_max": 10, "y_min": 0, "y_max": 10},
    "entities": [
        {
            "x": "sensor.kitchen_ld2450_target_1_x",
            "y": "sensor.kitchen_ld2450_target_1_y",
        }
    ],
    "rotation_deg": 30,
}

OLD_ZONE_UID = f"{DOMAIN}_{slugify(RADAR_NAME)}_zone_1"
OLD_PRESENCE_UID = f"{OLD_ZONE_UID}_presence"


def _make_radar(hass, device_registry, name: str) -> DeviceEntry:
    """Register an esphome radar device. Its config entry has to be real."""
    # The device registry refuses to link a device to a config entry that does
    # not exist, so the radar's owning entry has to be real.
    esphome_entry = MockConfigEntry(domain="esphome", title=name)
    esphome_entry.add_to_hass(hass)
    return device_registry.async_get_or_create(
        config_entry_id=esphome_entry.entry_id,
        identifiers={("esphome", name)},
        name=name,
    )


def _register_legacy_zone(hass, location: str, zone_id: int) -> str:
    """Register one pre-1.2.0 zone sensor and return its entity id."""
    # Legacy friendly names slugged into zone_mapper_* entity ids, while the
    # vendored card constructs apollo_mmwave_* ids, so these never matched.
    slug = slugify(location)
    entry = er.async_get(hass).async_get_or_create(
        "sensor",
        DOMAIN,
        f"{DOMAIN}_{slug}_zone_{zone_id}",
        suggested_object_id=f"zone_mapper_{slug}_zone_{zone_id}",
        original_name=f"Zone Mapper {location} Zone {zone_id}",
    )
    return entry.entity_id


def _register_legacy_entities(hass) -> None:
    _register_legacy_zone(hass, "Office", 1)
    er.async_get(hass).async_get_or_create(
        "binary_sensor",
        DOMAIN,
        f"{DOMAIN}_office_zone_1_presence",
        suggested_object_id="office_zone_1_presence",
        original_name="Office Zone 1 Presence",
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


def _register_zone_mapper_zone(hass, location: str, zone_id: int) -> str:
    """Register one sensor owned by the standalone zone_mapper integration."""
    slug = slugify(location)
    entry = er.async_get(hass).async_get_or_create(
        "sensor",
        "zone_mapper",
        f"zone_mapper_{slug}_zone_{zone_id}",
        suggested_object_id=f"zone_mapper_{slug}_zone_{zone_id}",
        original_name=f"Zone Mapper {location} Zone {zone_id}",
    )
    return entry.entity_id


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


async def test_legacy_locations_colliding_on_one_device_keep_both_zones(
    hass, config_entry, esphome_device, caplog
) -> None:
    """A mid-life rename left two locations on one radar; neither may vanish."""
    _ = esphome_device
    office_1 = _register_legacy_zone(hass, "Office", 1)
    den_1 = _register_legacy_zone(hass, "Den", 1)
    den_2 = _register_legacy_zone(hass, "Den", 2)
    # Both locations tracked the same radar's coordinate sensors, which is how
    # a rename presents: the old name never went away.
    mock_restore_cache(
        hass,
        [
            State(office_1, "1", {**LEGACY_ATTRS, "name": "Couch"}),
            State(den_1, "1", {**LEGACY_ATTRS, "shape": "ellipse", "name": "Chair"}),
            State(den_2, "1", {**LEGACY_ATTRS, "name": "Rug"}),
        ],
    )

    await setup_integration(hass, config_entry)

    zones = get_store(hass).devices[esphome_device.id][STORE_ZONES]
    # First writer wins, and the loser is reported rather than dropped silently.
    assert zones[1]["name"] == "Couch"
    assert zones[1]["shape"] == "rect"
    assert zones[2]["name"] == "Rug"
    conflicts = [
        record.message
        for record in caplog.records
        if record.levelname == "WARNING" and "Office" in record.message
    ]
    assert conflicts, "expected a warning about the conflicting zone id"
    assert "Den" in conflicts[0]


async def test_a_locations_zones_resolve_together(
    hass, config_entry, device_registry, esphome_device, caplog
) -> None:
    """One location, one device: a data-less zone follows its siblings."""
    # A decoy whose name matches the location. Resolving zone by zone would send
    # zone 2, which has no tracked pairs of its own to follow, to this device.
    _make_radar(hass, device_registry, "Office")
    office_1 = _register_legacy_zone(hass, "Office", 1)
    _register_legacy_zone(hass, "Office", 2)
    mock_restore_cache(hass, [State(office_1, "1", LEGACY_ATTRS)])

    await setup_integration(hass, config_entry)

    store = get_store(hass)
    assert sorted(store.devices[esphome_device.id][STORE_ZONES]) == [1, 2]
    assert store.orphans == {}
    assert not [
        record for record in caplog.records if "matches no Home Assistant" in record.msg
    ]


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
    hass, hass_storage, entity_registry, area_registry, esphome_device
) -> None:
    """The pre-2.0 entity survives whole: same id, name, area, and device."""
    # The area is the customization that actually costs the user to rebuild, and
    # it is the one an implementation that recreated the entity would lose.
    area = area_registry.async_create("Living Room")
    old = entity_registry.async_get_or_create(
        "sensor",
        DOMAIN,
        OLD_ZONE_UID,
        suggested_object_id=OLD_ZONE_UID,
        device_id=esphome_device.id,
    )
    entity_registry.async_update_entity(old.entity_id, name="Couch", area_id=area.id)
    store = await _v1_store(hass, hass_storage, RADAR_NAME)

    await async_migrate_unique_ids(hass, store)

    new_uid = f"{esphome_device.id}_zone_1"
    assert entity_registry.async_get_entity_id("sensor", DOMAIN, new_uid) == (
        old.entity_id
    )
    migrated = entity_registry.async_get(old.entity_id)
    assert migrated.unique_id == new_uid
    assert migrated.name == "Couch"
    assert migrated.area_id == area.id
    assert migrated.device_id == esphome_device.id


async def test_migrating_unique_ids_twice_changes_nothing(
    hass, hass_storage, entity_registry, esphome_device
) -> None:
    """It runs on every setup, so a second pass must not undo or re-key."""
    old = entity_registry.async_get_or_create(
        "sensor",
        DOMAIN,
        OLD_ZONE_UID,
        suggested_object_id=OLD_ZONE_UID,
    )
    store = await _v1_store(hass, hass_storage, RADAR_NAME)
    await async_migrate_unique_ids(hass, store)
    after_first = entity_registry.async_get(old.entity_id)
    devices_after_first = dict(store.devices)

    await async_migrate_unique_ids(hass, store)

    assert after_first.unique_id == f"{esphome_device.id}_zone_1"
    assert entity_registry.async_get(old.entity_id) == after_first
    assert store.devices == devices_after_first


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


async def test_orphaned_zones_are_promoted_when_their_device_resolves(
    hass, config_entry, hass_storage, entity_registry, device_registry
) -> None:
    """A renamed radar with no tracked pairs still gets its entities adopted."""
    # This is the state a v1 upgrade leaves on disk for a user who renamed their
    # radar and never picked coordinate sensors: v1 seeded `entities: []`, so
    # nothing pointed at the device and the name fallback missed. The location
    # is frozen in `orphans`, no label reaches `devices`, and without promotion
    # the unique-id rewrite below has nothing to match.
    device = _make_radar(hass, device_registry, "Old Office")
    old = entity_registry.async_get_or_create(
        "sensor",
        DOMAIN,
        f"{DOMAIN}_old_office_zone_1",
        suggested_object_id="old_office_zone_1",
    )
    entity_registry.async_update_entity(old.entity_id, name="Couch")
    hass_storage[f"{DOMAIN}.zones"] = {
        "version": 2,
        "data": {
            "devices": {},
            "orphans": {
                "Old Office": {
                    "zones": {"1": {"shape": "rect", "data": {}}},
                    "label": "Old Office",
                }
            },
        },
    }

    await setup_integration(hass, config_entry)

    store = get_store(hass)
    assert store.orphans == {}
    assert store.devices[device.id][STORE_ZONES][1]["shape"] == "rect"
    assert (
        entity_registry.async_get_entity_id("sensor", DOMAIN, f"{device.id}_zone_1")
        == old.entity_id
    )
    assert entity_registry.async_get(old.entity_id).name == "Couch"


async def test_promotion_does_not_overwrite_zones_already_on_the_device(
    hass, hass_storage, device_registry
) -> None:
    """The entry that resolved outright wins; the orphan only fills gaps."""
    device = _make_radar(hass, device_registry, "Old Office")
    hass_storage[f"{DOMAIN}.zones"] = {
        "version": 2,
        "data": {
            "devices": {
                device.id: {
                    "zones": {"1": {"shape": "ellipse", "data": {}}},
                    "label": "Old Office",
                }
            },
            "orphans": {
                "Old Office": {
                    "zones": {
                        "1": {"shape": "rect", "data": {}},
                        "2": {"shape": "polygon", "data": {}},
                    },
                    "rotation_deg": 90,
                }
            },
        },
    }
    store = ZoneStore(hass)
    assert await store.async_load() is True

    await async_migrate_unique_ids(hass, store)

    entry = store.devices[device.id]
    assert entry[STORE_ZONES][1]["shape"] == "ellipse"
    assert entry[STORE_ZONES][2]["shape"] == "polygon"
    assert entry["rotation_deg"] == 90
    assert store.orphans == {}


async def test_unresolvable_orphans_are_left_where_they_are(
    hass, hass_storage, entity_registry, esphome_device
) -> None:
    """Promotion is a rescue, not a licence to guess."""
    _ = esphome_device
    old = entity_registry.async_get_or_create(
        "sensor",
        DOMAIN,
        f"{DOMAIN}_ghost_room_zone_1",
        suggested_object_id="ghost_room_zone_1",
    )
    hass_storage[f"{DOMAIN}.zones"] = {
        "version": 2,
        "data": {
            "devices": {},
            "orphans": {"Ghost Room": {"zones": {"1": {"shape": "rect"}}}},
        },
    }
    store = ZoneStore(hass)
    assert await store.async_load() is True

    await async_migrate_unique_ids(hass, store)

    assert list(store.orphans) == ["Ghost Room"]
    assert store.devices == {}
    assert (
        entity_registry.async_get(old.entity_id).unique_id
        == f"{DOMAIN}_ghost_room_zone_1"
    )


async def test_imports_zones_from_the_standalone_zone_mapper(
    hass, entity_registry, device_registry
) -> None:
    """A 2-piece install carries its zones across instead of looking wiped."""
    device = _make_radar(hass, device_registry, "Kitchen")
    legacy = _register_zone_mapper_zone(hass, "Kitchen", 1)
    mock_restore_cache(hass, [State(legacy, "1", ZONE_MAPPER_ATTRS)])
    store = ZoneStore(hass)

    imported = await async_import_zone_mapper(hass, store)

    assert imported == 1
    assert store.devices[device.id][STORE_ZONES][1]["shape"] == "rect"
    assert store.devices[device.id]["rotation_deg"] == 30
    assert entity_registry.async_get(legacy) is not None


async def test_import_leaves_zone_mapper_entity_ids_alone(
    hass, entity_registry
) -> None:
    """The other integration may still be running; do not rename its entities."""
    legacy = _register_zone_mapper_zone(hass, "Ghost", 1)

    await async_import_zone_mapper(hass, ZoneStore(hass))

    assert entity_registry.async_get(legacy).entity_id == legacy


async def test_imported_locations_colliding_on_one_device_keep_both_zones(
    hass, esphome_device, caplog
) -> None:
    """A radar renamed under zone_mapper left two locations; neither may vanish."""
    kitchen_1 = _register_zone_mapper_zone(hass, "Kitchen", 1)
    den_1 = _register_zone_mapper_zone(hass, "Den", 1)
    den_2 = _register_zone_mapper_zone(hass, "Den", 2)
    # Both locations tracked the same radar's coordinate sensors, which is how a
    # rename presents: the old name never went away.
    tracked = {"entities": [{"x": TARGET_X, "y": TARGET_Y}]}
    mock_restore_cache(
        hass,
        [
            State(kitchen_1, "1", {**ZONE_MAPPER_ATTRS, **tracked, "name": "Couch"}),
            State(
                den_1,
                "1",
                {**ZONE_MAPPER_ATTRS, **tracked, "shape": "ellipse", "name": "Chair"},
            ),
            State(den_2, "1", {**ZONE_MAPPER_ATTRS, **tracked, "name": "Rug"}),
        ],
    )
    store = ZoneStore(hass)

    imported = await async_import_zone_mapper(hass, store)

    zones = store.devices[esphome_device.id][STORE_ZONES]
    # First writer wins, and the loser is reported rather than dropped silently.
    assert imported == 2
    assert zones[1]["name"] == "Couch"
    assert zones[2]["name"] == "Rug"
    conflicts = [
        record.message
        for record in caplog.records
        if record.levelname == "WARNING" and "Kitchen" in record.message
    ]
    assert conflicts, "expected a warning about the conflicting zone id"
    assert "Den" in conflicts[0]
