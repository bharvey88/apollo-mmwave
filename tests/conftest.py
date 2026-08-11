"""Shared fixtures for Apollo mmWave tests."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest
from homeassistant.helpers.dispatcher import async_dispatcher_send
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.apollo_mmwave import get_store
from custom_components.apollo_mmwave.const import (
    DOMAIN,
    SIGNAL_ZONES_UPDATED,
    STORE_ZONES,
)

if TYPE_CHECKING:
    from homeassistant.helpers.device_registry import DeviceEntry

RADAR_NAME = "Apollo R_PRO-1 abc123"
RADAR_TARGET_COUNT = 3

RECT_ZONE: dict[str, Any] = {
    "shape": "rect",
    "data": {"x_min": -1000, "x_max": 1000, "y_min": 0, "y_max": 2000},
}


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Let the test hass load custom_components/apollo_mmwave."""
    return


@pytest.fixture
def config_entry() -> MockConfigEntry:
    """
    Return a plain Apollo mmWave entry with the dashboard turned off.

    The dashboard/panel path pokes Lovelace internals that aren't interesting
    to most tests; individual tests opt back in via options.
    """
    return MockConfigEntry(
        domain=DOMAIN,
        title="Apollo mmWave",
        data={},
        options={"auto_create_view": False},
        unique_id=DOMAIN,
    )


@pytest.fixture
def esphome_device(hass, device_registry, entity_registry) -> DeviceEntry:
    """Register a radar device with a full set of LD2450 target sensors."""
    # The device registry refuses to link a device to a config entry that does
    # not exist, so the radar's owning esphome entry has to be real.
    esphome_entry = MockConfigEntry(domain="esphome", title=RADAR_NAME)
    esphome_entry.add_to_hass(hass)
    device = device_registry.async_get_or_create(
        config_entry_id=esphome_entry.entry_id,
        identifiers={("esphome", "apollo_r_pro_1_abc123")},
        name=RADAR_NAME,
    )
    for target in range(1, RADAR_TARGET_COUNT + 1):
        for axis in ("x", "y"):
            entity_registry.async_get_or_create(
                "sensor",
                "esphome",
                f"target_{target}_{axis}",
                device_id=device.id,
                suggested_object_id=f"r_pro_ld2450_target_{target}_{axis}",
            )
    return device


@pytest.fixture
def device_id(esphome_device) -> str:
    """Return the radar's Home Assistant device id."""
    return esphome_device.id


async def setup_integration(hass, entry: MockConfigEntry) -> None:
    """Add the entry and set the integration up."""
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


@pytest.fixture
async def init_integration(hass, config_entry, esphome_device) -> MockConfigEntry:
    """Set the integration up with the radar device already registered."""
    _ = esphome_device
    await setup_integration(hass, config_entry)
    return config_entry


@pytest.fixture
async def setup_entry_with_zone(hass, init_integration, device_id) -> tuple[str, Any]:
    """Set the integration up with one rect zone drawn on the radar."""
    # Written straight to the store rather than through the update_zone service:
    # the service's payload is still being reshaped, and every consumer of this
    # fixture cares about the resulting entities, not about how they got there.
    store = get_store(hass)
    store.device(device_id)[STORE_ZONES][1] = dict(RECT_ZONE)
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()
    return device_id, init_integration
