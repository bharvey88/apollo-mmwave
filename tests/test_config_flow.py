"""Config and options flow tests."""

from __future__ import annotations

from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResultType

from custom_components.apollo_mmwave.const import CONF_AUTO_CREATE_VIEW, DOMAIN

from .conftest import setup_integration


async def test_user_flow_creates_entry_with_dashboard_choice(hass) -> None:
    """The initial step asks about the dashboard and stores it in options."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_AUTO_CREATE_VIEW: False}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Apollo mmWave"
    assert result["options"] == {CONF_AUTO_CREATE_VIEW: False}


async def test_single_instance(hass, config_entry) -> None:
    """A second flow aborts once an entry exists."""
    await setup_integration(hass, config_entry)

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "already_configured"


async def test_options_flow_toggles_dashboard(hass, config_entry) -> None:
    """The options flow round-trips the dashboard toggle."""
    await setup_integration(hass, config_entry)

    result = await hass.config_entries.options.async_init(config_entry.entry_id)
    assert result["type"] is FlowResultType.FORM

    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {CONF_AUTO_CREATE_VIEW: True}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert config_entry.options == {CONF_AUTO_CREATE_VIEW: True}
