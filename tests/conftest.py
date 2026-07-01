"""Shared fixtures for Apollo mmWave tests."""

from __future__ import annotations

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.apollo_mmwave.const import DOMAIN


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


async def setup_integration(hass, entry: MockConfigEntry) -> None:
    """Add the entry and set the integration up."""
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
