"""Service, entity, store, and unload behavior."""

from __future__ import annotations

from custom_components.apollo_mmwave import get_store
from custom_components.apollo_mmwave.const import (
    DOMAIN,
    SERVICE_UPDATE_ZONE,
    STORE_ZONES,
)

from .conftest import setup_integration

TRACKED = [
    {"x": "sensor.office_ld2450_target_1_x", "y": "sensor.office_ld2450_target_1_y"}
]


def _set_target(hass, x: float, y: float) -> None:
    hass.states.async_set(TRACKED[0]["x"], str(x))
    hass.states.async_set(TRACKED[0]["y"], str(y))


async def _create_rect_zone(hass, location: str = "Office") -> None:
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {
            "location": location,
            "zone_id": 1,
            "shape": "rect",
            "data": {"x_min": -1000, "x_max": 1000, "y_min": 0, "y_max": 2000},
            "entities": TRACKED,
        },
        blocking=True,
    )
    await hass.async_block_till_done()


async def test_zone_creates_card_contract_entities(hass, config_entry) -> None:
    """Zone entities exist under the exact ids the zone-mapper-card constructs."""
    await setup_integration(hass, config_entry)
    await _create_rect_zone(hass)

    coord = hass.states.get("sensor.apollo_mmwave_office_zone_1")
    assert coord is not None
    assert coord.state == "1"
    assert coord.attributes["shape"] == "rect"
    assert coord.attributes["data"] == {
        "x_min": -1000,
        "x_max": 1000,
        "y_min": 0,
        "y_max": 2000,
    }
    assert coord.attributes["entities"] == TRACKED

    presence = hass.states.get("binary_sensor.apollo_mmwave_office_zone_1_presence")
    assert presence is not None
    assert presence.state == "off"


async def test_presence_tracks_targets(hass, config_entry) -> None:
    """Presence flips as the tracked target moves in and out of the zone."""
    await setup_integration(hass, config_entry)
    await _create_rect_zone(hass)
    presence_id = "binary_sensor.apollo_mmwave_office_zone_1_presence"

    _set_target(hass, 0, 1000)  # inside
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    _set_target(hass, 5000, 1000)  # outside x
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    # (0, 0) readings mean "no target" and must not count as inside.
    _set_target(hass, 0, 0)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"


async def test_presence_applies_rotation(hass, config_entry) -> None:
    """A 90° device rotation maps (x, y) -> (y, -x) before the zone test."""
    await setup_integration(hass, config_entry)
    await _create_rect_zone(hass)
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"location": "Office", "rotation_deg": 90},
        blocking=True,
    )
    await hass.async_block_till_done()
    presence_id = "binary_sensor.apollo_mmwave_office_zone_1_presence"

    # Rotated by 90°: (1000, 0) -> (0, -1000): outside (y_min=0).
    _set_target(hass, 1000, 0)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    # Rotated by 90°: (0, -1000)... use (-1000, 0) -> (0, 1000): inside.
    _set_target(hass, -1000, 0)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"


async def test_delete_zone_removes_entities_and_store(hass, config_entry) -> None:
    """Deleting a zone removes both entities and the stored definition."""
    await setup_integration(hass, config_entry)
    await _create_rect_zone(hass)

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"location": "Office", "zone_id": 1, "delete": True},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert hass.states.get("sensor.apollo_mmwave_office_zone_1") is None
    assert hass.states.get("binary_sensor.apollo_mmwave_office_zone_1_presence") is None
    assert get_store(hass).location("Office")[STORE_ZONES] == {}


async def test_zone_recreated_after_delete(hass, config_entry) -> None:
    """A re-created zone id gets fresh entities (tracker must not go stale)."""
    await setup_integration(hass, config_entry)
    await _create_rect_zone(hass)
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"location": "Office", "zone_id": 1, "delete": True},
        blocking=True,
    )
    await hass.async_block_till_done()

    await _create_rect_zone(hass)
    assert hass.states.get("sensor.apollo_mmwave_office_zone_1") is not None


async def test_zone_persists_to_storage(hass, config_entry, hass_storage) -> None:
    """Unload flushes zones to .storage/apollo_mmwave.zones."""
    await setup_integration(hass, config_entry)
    await _create_rect_zone(hass)

    assert await hass.config_entries.async_unload(config_entry.entry_id)
    await hass.async_block_till_done()

    stored = hass_storage[f"{DOMAIN}.zones"]["data"]
    assert stored["locations"]["Office"][STORE_ZONES]["1"]["shape"] == "rect"


async def test_zones_reload_from_storage(hass, config_entry, hass_storage) -> None:
    """A fresh setup reads zones straight from the store (no restore states)."""
    hass_storage[f"{DOMAIN}.zones"] = {
        "version": 1,
        "data": {
            "locations": {
                "Office": {
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
                    "entities": TRACKED,
                }
            }
        },
    }
    await setup_integration(hass, config_entry)

    coord = hass.states.get("sensor.apollo_mmwave_office_zone_2")
    assert coord is not None
    assert coord.attributes["shape"] == "rect"


async def test_unload_removes_service(hass, config_entry) -> None:
    """Unloading the entry removes the update_zone service."""
    await setup_integration(hass, config_entry)
    assert hass.services.has_service(DOMAIN, SERVICE_UPDATE_ZONE)

    assert await hass.config_entries.async_unload(config_entry.entry_id)
    await hass.async_block_till_done()
    assert not hass.services.has_service(DOMAIN, SERVICE_UPDATE_ZONE)
