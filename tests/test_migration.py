"""Legacy (pre-1.2.0) migration: restore states -> store, entity_id renames."""

from __future__ import annotations

from homeassistant.core import State
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import mock_restore_cache

from custom_components.apollo_mmwave import get_store
from custom_components.apollo_mmwave.const import DOMAIN, STORE_ZONES

from .conftest import setup_integration

LEGACY_ATTRS = {
    "shape": "rect",
    "data": {"x_min": -500, "x_max": 500, "y_min": 0, "y_max": 1500},
    "entities": [{"x": "sensor.t1x", "y": "sensor.t1y"}],
    "rotation_deg": 15,
    "name": "Desk",
}


def _register_legacy_entities(hass) -> None:
    registry = er.async_get(hass)
    # Legacy friendly names slugged into zone_mapper_* entity ids — the
    # vendored card constructs apollo_mmwave_* ids, so these never matched.
    registry.async_get_or_create(
        "sensor",
        DOMAIN,
        "apollo_mmwave_office_zone_1",
        suggested_object_id="zone_mapper_office_zone_1",
        original_name="Zone Mapper Office Zone 1",
    )
    registry.async_get_or_create(
        "binary_sensor",
        DOMAIN,
        "apollo_mmwave_office_zone_1_presence",
        suggested_object_id="office_zone_1_presence",
        original_name="Office Zone 1 Presence",
    )


async def test_migrates_restore_state_into_store(hass, config_entry) -> None:
    """Legacy zone data lands in the store with the display location intact."""
    _register_legacy_entities(hass)
    mock_restore_cache(
        hass, [State("sensor.zone_mapper_office_zone_1", "1", LEGACY_ATTRS)]
    )

    await setup_integration(hass, config_entry)

    loc = get_store(hass).location("Office")
    assert loc[STORE_ZONES][1]["shape"] == "rect"
    assert loc[STORE_ZONES][1]["name"] == "Desk"
    assert loc["entities"] == [{"x": "sensor.t1x", "y": "sensor.t1y"}]
    assert loc["rotation_deg"] == 15


async def test_migrates_entity_ids_to_card_contract(hass, config_entry) -> None:
    """Legacy entity_ids are renamed to <domain>.<unique_id> for the card."""
    _register_legacy_entities(hass)
    mock_restore_cache(
        hass, [State("sensor.zone_mapper_office_zone_1", "1", LEGACY_ATTRS)]
    )

    await setup_integration(hass, config_entry)

    registry = er.async_get(hass)
    assert (
        registry.async_get_entity_id("sensor", DOMAIN, "apollo_mmwave_office_zone_1")
        == "sensor.apollo_mmwave_office_zone_1"
    )
    assert (
        registry.async_get_entity_id(
            "binary_sensor", DOMAIN, "apollo_mmwave_office_zone_1_presence"
        )
        == "binary_sensor.apollo_mmwave_office_zone_1_presence"
    )
    # The migrated zone is live under the new id.
    state = hass.states.get("sensor.apollo_mmwave_office_zone_1")
    assert state is not None
    assert state.attributes["name"] == "Desk"


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

    assert get_store(hass).locations == {}
