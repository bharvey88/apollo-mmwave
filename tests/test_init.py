"""Service, store, and unload behavior."""

from __future__ import annotations

from homeassistant.helpers import entity_registry as er

from custom_components.apollo_mmwave import get_store
from custom_components.apollo_mmwave.const import (
    ATTR_ROTATION_DEG,
    DOMAIN,
    SERVICE_UPDATE_ZONE,
    STORE_DEVICES,
    STORE_ENTITIES,
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
            # Still spelled `location`; the value is a device id now.
            "location": device_id,
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


async def test_rotation_only_update_is_stored(
    hass, init_integration, device_id
) -> None:
    """A rotation update carries no geometry and must not clear the zone."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"location": device_id, ATTR_ROTATION_DEG: 90},
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
        {"location": device_id, "zone_id": 1, "delete": True},
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
        {"location": device_id, "zone_id": 1, "delete": True},
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


async def test_unload_removes_service(hass, init_integration) -> None:
    """Unloading the entry removes the update_zone service."""
    assert hass.services.has_service(DOMAIN, SERVICE_UPDATE_ZONE)

    assert await hass.config_entries.async_unload(init_integration.entry_id)
    await hass.async_block_till_done()
    assert not hass.services.has_service(DOMAIN, SERVICE_UPDATE_ZONE)
