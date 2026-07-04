"""
Config and options flow for Apollo mmWave.

The integration is UI-configurable and has a single setup step that just
creates the singleton entry. The options flow exposes a single toggle for the
auto-created dashboard.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import (
    CONF_AUTO_CREATE_VIEW,
    CONF_DASHBOARD_DEVICES,
    DEFAULT_AUTO_CREATE_VIEW,
    DOMAIN,
)

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry


class ApolloMmwaveConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Config flow to create a single Apollo mmWave entry."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict | None = None
    ) -> config_entries.ConfigFlowResult:
        """Ask about the auto-dashboard and create the entry when submitted."""
        if self._async_current_entries():
            return self.async_abort(reason="already_configured")

        if user_input is not None:
            await self.async_set_unique_id(DOMAIN)
            self._abort_if_unique_id_configured()
            return self.async_create_entry(
                title="Apollo mmWave",
                data={},
                options={
                    CONF_AUTO_CREATE_VIEW: user_input.get(
                        CONF_AUTO_CREATE_VIEW, DEFAULT_AUTO_CREATE_VIEW
                    ),
                },
            )

        schema = vol.Schema(
            {
                vol.Required(
                    CONF_AUTO_CREATE_VIEW, default=DEFAULT_AUTO_CREATE_VIEW
                ): bool,
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema)

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: ConfigEntry,
    ) -> ApolloMmwaveOptionsFlow:
        """Return the options flow for this entry."""
        return ApolloMmwaveOptionsFlow(config_entry)


class ApolloMmwaveOptionsFlow(config_entries.OptionsFlow):
    """Options flow with a single toggle for the auto-created dashboard."""

    def __init__(self, config_entry: ConfigEntry) -> None:
        """Store the entry the options apply to."""
        self._config_entry = config_entry

    async def async_step_init(
        self, user_input: dict | None = None
    ) -> config_entries.ConfigFlowResult:
        """Prompt for the dashboard toggle and device selection, and save."""
        if user_input is not None:
            user_input.setdefault(CONF_DASHBOARD_DEVICES, [])
            return self.async_create_entry(title="", data=user_input)

        current_auto = self._config_entry.options.get(
            CONF_AUTO_CREATE_VIEW, DEFAULT_AUTO_CREATE_VIEW
        )
        current_devices = self._config_entry.options.get(CONF_DASHBOARD_DEVICES, [])
        schema = vol.Schema(
            {
                vol.Required(CONF_AUTO_CREATE_VIEW, default=current_auto): bool,
                vol.Optional(
                    CONF_DASHBOARD_DEVICES,
                    default=list(current_devices),
                ): selector.DeviceSelector(
                    selector.DeviceSelectorConfig(
                        multiple=True,
                        # Entries OR together: only Apollo's mmWave-capable
                        # models, not every ApolloAutomation device (AIR-1,
                        # TEMP-1, …). Model strings come from the ESPHome
                        # project name (`ApolloAutomation.<MODEL>`); extend
                        # when new mmWave hardware ships.
                        filter=[
                            selector.DeviceFilterSelectorConfig(
                                manufacturer="ApolloAutomation", model=model
                            )
                            for model in (
                                "MSR-1",
                                "MSR-2",
                                "MTR-1",
                                "R-PRO-1-W",
                                "R-PRO-1-ETH",
                            )
                        ],
                    )
                ),
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema)
