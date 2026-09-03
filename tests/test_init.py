"""Service, store, and unload behavior."""

from __future__ import annotations

import pytest
import voluptuous as vol
from homeassistant.helpers import entity_registry as er

from custom_components.apollo_mmwave import get_store
from custom_components.apollo_mmwave.const import (
    ATTR_ROTATION_DEG,
    DOMAIN,
    EVENT_ZONE_UPDATED,
    SERVICE_UPDATE_ZONE,
    STORE_DEVICES,
    STORE_ENTITIES,
    STORE_LABEL,
    STORE_ORPHANS,
    STORE_ZONES,
)

TRACKED = [
    {
        "x": "sensor.r_pro_ld2450_target_1_x",
        "y": "sensor.r_pro_ld2450_target_1_y",
    }
]


async def _create_rect_zone(hass, device_id: str) -> None:
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {
            "device_id": device_id,
            "zone_id": 1,
            "shape": "rect",
            "data": {"x_min": -1000, "x_max": 1000, "y_min": 0, "y_max": 2000},
            "entities": TRACKED,
        },
        blocking=True,
    )
    await hass.async_block_till_done()


def _zone_entity_ids(hass, device_id: str) -> tuple[str | None, str | None]:
    registry = er.async_get(hass)
    return (
        registry.async_get_entity_id("sensor", DOMAIN, f"{device_id}_zone_1"),
        registry.async_get_entity_id(
            "binary_sensor", DOMAIN, f"{device_id}_zone_1_presence"
        ),
    )


async def test_service_creates_zone_entities(hass, init_integration, device_id) -> None:
    """A zone drawn through the service produces both entities and stored data."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)

    sensor_id, presence_id = _zone_entity_ids(hass, device_id)
    assert hass.states.get(sensor_id).state == "1"
    assert hass.states.get(presence_id).state == "off"
    assert get_store(hass).device(device_id)[STORE_ENTITIES] == TRACKED


async def test_zone_update_fires_the_public_event(
    hass, init_integration, device_id
) -> None:
    """The bus event is API surface, and it identifies the radar by device id."""
    _ = init_integration
    events = []
    hass.bus.async_listen(EVENT_ZONE_UPDATED, events.append)

    await _create_rect_zone(hass, device_id)

    assert [event.data for event in events] == [{"device_id": device_id}]


async def test_rotation_only_update_is_stored(
    hass, init_integration, device_id
) -> None:
    """A rotation update carries no geometry and must not clear the zone."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, ATTR_ROTATION_DEG: 90},
        blocking=True,
    )
    await hass.async_block_till_done()

    device = get_store(hass).device(device_id)
    assert device[ATTR_ROTATION_DEG] == 90
    assert device[STORE_ZONES][1]["shape"] == "rect"


async def test_delete_zone_removes_entities_and_store(
    hass, init_integration, device_id
) -> None:
    """Deleting a zone removes both entities and the stored definition."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "zone_id": 1, "delete": True},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert _zone_entity_ids(hass, device_id) == (None, None)
    assert get_store(hass).device(device_id)[STORE_ZONES] == {}


async def test_zone_recreated_after_delete(hass, init_integration, device_id) -> None:
    """A re-created zone id gets fresh entities (tracker must not go stale)."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "zone_id": 1, "delete": True},
        blocking=True,
    )
    await hass.async_block_till_done()

    await _create_rect_zone(hass, device_id)
    assert _zone_entity_ids(hass, device_id)[0] is not None


async def test_zone_persists_to_storage(
    hass, init_integration, device_id, hass_storage
) -> None:
    """Unload flushes zones to .storage/apollo_mmwave.zones."""
    await _create_rect_zone(hass, device_id)

    assert await hass.config_entries.async_unload(init_integration.entry_id)
    await hass.async_block_till_done()

    stored = hass_storage[f"{DOMAIN}.zones"]["data"]
    assert stored[STORE_DEVICES][device_id][STORE_ZONES]["1"]["shape"] == "rect"


async def test_zones_reload_from_storage(
    hass, config_entry, esphome_device, hass_storage
) -> None:
    """A fresh setup reads zones straight from the store (no restore states)."""
    from .conftest import setup_integration  # noqa: PLC0415 - avoids a cycle

    hass_storage[f"{DOMAIN}.zones"] = {
        "version": 2,
        "data": {
            STORE_DEVICES: {
                esphome_device.id: {
                    STORE_ZONES: {
                        "2": {
                            "shape": "rect",
                            "data": {
                                "x_min": 0,
                                "x_max": 10,
                                "y_min": 0,
                                "y_max": 10,
                            },
                        }
                    },
                    STORE_ENTITIES: TRACKED,
                }
            },
            STORE_ORPHANS: {},
        },
    }
    await setup_integration(hass, config_entry)

    sensor_id = er.async_get(hass).async_get_entity_id(
        "sensor", DOMAIN, f"{esphome_device.id}_zone_2"
    )
    assert sensor_id is not None
    assert hass.states.get(sensor_id).attributes["shape"] == "rect"


async def test_empty_entities_list_does_not_wipe_saved_pairs(
    hass, init_integration, device_id
) -> None:
    """A zone edit from a card that has not loaded its pairs must not erase them."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {
            "device_id": device_id,
            "zone_id": 1,
            "shape": "rect",
            "data": {"x_min": 0, "x_max": 10, "y_min": 0, "y_max": 10},
            "entities": [],
        },
        blocking=True,
    )
    await hass.async_block_till_done()

    assert get_store(hass).device(device_id)[STORE_ENTITIES] == TRACKED


async def test_clear_entities_flag_explicitly_empties_the_list(
    hass, init_integration, device_id
) -> None:
    """`clear_entities` is the only way to write an explicit empty list."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "clear_entities": True},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert get_store(hass).device(device_id)[STORE_ENTITIES] == []


async def test_call_without_entities_never_seeds_the_key(
    hass, init_integration, device_id
) -> None:
    """Absent must stay absent, or the LD2450 presence fallback switches off."""
    _ = init_integration
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, ATTR_ROTATION_DEG: 90},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert STORE_ENTITIES not in get_store(hass).device(device_id)


async def test_deprecated_location_resolves_through_the_stored_label(
    hass, init_integration, device_id
) -> None:
    """Automations written against the v1 `location` field keep working."""
    _ = init_integration
    get_store(hass).device(device_id)[STORE_LABEL] = "Apollo R_PRO-1 abc123"

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"location": "apollo r_pro-1 abc123", ATTR_ROTATION_DEG: 90},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert get_store(hass).device(device_id)[ATTR_ROTATION_DEG] == 90


async def test_unresolvable_location_writes_nothing(
    hass, init_integration, device_id
) -> None:
    """An unknown label must not invent a device entry the store never had."""
    _ = init_integration
    store = get_store(hass)

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"location": "Some Room That Never Existed", ATTR_ROTATION_DEG: 90},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert "Some Room That Never Existed" not in store.devices
    assert store.devices.get(device_id, {}).get(ATTR_ROTATION_DEG) is None


async def test_unknown_device_id_writes_nothing(hass, init_integration) -> None:
    """A stale or copy-pasted device id must not fabricate a phantom store entry."""
    _ = init_integration
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": "totally-bogus-device-id", ATTR_ROTATION_DEG: 90},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert "totally-bogus-device-id" not in get_store(hass).devices


async def test_device_id_accepts_the_target_block_shape(
    hass, init_integration, device_id
) -> None:
    """An automation using `target:` sends device_id as a single-item list."""
    _ = init_integration
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": [device_id], ATTR_ROTATION_DEG: 90},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert get_store(hass).device(device_id)[ATTR_ROTATION_DEG] == 90


async def test_targeting_several_devices_writes_nothing(
    hass, init_integration, device_id
) -> None:
    """A zone belongs to exactly one radar, so a multi-device target is refused."""
    _ = init_integration
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": [device_id, "another-device"], ATTR_ROTATION_DEG: 90},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert get_store(hass).devices.get(device_id, {}).get(ATTR_ROTATION_DEG) is None


async def test_location_deprecation_is_warned_about_once(
    hass, init_integration, device_id, caplog
) -> None:
    """The card rotates on every drag; the deprecation must not flood the log."""
    _ = init_integration
    get_store(hass).device(device_id)[STORE_LABEL] = "Office"

    for angle in (10, 20, 30):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_ZONE,
            {"location": "Office", ATTR_ROTATION_DEG: angle},
            blocking=True,
        )
    await hass.async_block_till_done()

    assert caplog.text.count("'location' field is deprecated") == 1
    assert get_store(hass).device(device_id)[ATTR_ROTATION_DEG] == 30


async def test_location_for_a_removed_radar_writes_nothing(
    hass, init_integration, device_id, device_registry
) -> None:
    """Nothing prunes the store, so a label can outlive the radar it named."""
    _ = init_integration
    store = get_store(hass)
    store.device(device_id)[STORE_LABEL] = "Office"
    device_registry.async_remove_device(device_id)
    await hass.async_block_till_done()

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"location": "Office", ATTR_ROTATION_DEG: 90},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert store.devices.get(device_id, {}).get(ATTR_ROTATION_DEG) is None


async def test_update_zone_requires_a_target(hass, init_integration) -> None:
    """Neither `device_id` nor `location`: the schema rejects the call."""
    _ = init_integration
    with pytest.raises(vol.Invalid):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_ZONE,
            {ATTR_ROTATION_DEG: 90},
            blocking=True,
        )


async def test_unload_removes_service(hass, init_integration) -> None:
    """Unloading the entry removes the update_zone service."""
    assert hass.services.has_service(DOMAIN, SERVICE_UPDATE_ZONE)

    assert await hass.config_entries.async_unload(init_integration.entry_id)
    await hass.async_block_till_done()
    assert not hass.services.has_service(DOMAIN, SERVICE_UPDATE_ZONE)


async def test_call_with_nothing_to_change_mints_no_store_entry(
    hass, init_integration, device_id, caplog
) -> None:
    """A device_id alone must not create a permanent empty store entry."""
    _ = init_integration
    await hass.services.async_call(
        DOMAIN, SERVICE_UPDATE_ZONE, {"device_id": device_id}, blocking=True
    )
    await hass.async_block_till_done()

    assert device_id not in get_store(hass).devices
    assert "carried nothing to change" in caplog.text


async def test_delete_without_zone_id_changes_nothing(
    hass, init_integration, device_id, caplog
) -> None:
    """`delete: true` with no zone_id is refused instead of reinterpreted."""
    _ = init_integration
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "delete": True, "rotation_deg": 45},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert device_id not in get_store(hass).devices
    assert "without a zone_id" in caplog.text
