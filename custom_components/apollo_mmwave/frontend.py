"""
Frontend wiring for Apollo mmWave.

This integration ships its own Lovelace frontend so users install ONE thing:

1. ``async_register_frontend_assets`` serves the bundled JS (the radar-tuning
   cards + dashboard strategy, and the vendored zone-mapper-card) from
   ``custom_components/apollo_mmwave/www`` and registers them as extra JS URLs,
   so the cards/strategy are available everywhere without a separate HACS card
   install.

2. ``async_register_dashboard`` registers a dedicated, strategy-backed
   "Apollo mmWave" dashboard in the sidebar. The dashboard config is simply
   ``{"strategy": {"type": "custom:apollo-radar-tuning"}}`` — the frontend
   strategy re-runs on every load, detecting each Apollo mmWave device and
   building one tab per device, so the dashboard self-updates as devices come
   and go (no one-time seeding, no stored card layout to drift).

Lovelace internals (``hass.data[LOVELACE_DATA].dashboards``) are not a public
contract, so registration is defensive: if the shape ever changes we log and
continue without the auto-dashboard rather than failing setup.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace.const import LOVELACE_DATA, MODE_STORAGE
from homeassistant.components.lovelace.dashboard import LovelaceConfig
from homeassistant.const import CONF_URL_PATH
from homeassistant.helpers.json import json_bytes, json_fragment
from homeassistant.loader import async_get_integration

from .const import (
    DASHBOARD_ICON,
    DASHBOARD_STRATEGY_TYPE,
    DASHBOARD_TITLE,
    DASHBOARD_URL_PATH,
    DOMAIN,
    FRONTEND_DIR,
    JS_BUNDLES,
    STATIC_URL_BASE,
)

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


def _frontend_path() -> Path:
    """Absolute path to the bundled ``www`` directory."""
    return Path(__file__).parent / FRONTEND_DIR


async def async_register_frontend_assets(hass: HomeAssistant) -> None:
    """Serve and register the bundled JS so the cards/strategy load globally."""
    base = _frontend_path()
    try:
        version = (await async_get_integration(hass, DOMAIN)).version or "0"
    except Exception:  # noqa: BLE001 - version is only used for cache-busting
        version = "0"

    static_paths: list[StaticPathConfig] = []
    js_urls: list[str] = []
    for name in JS_BUNDLES:
        file_path = base / name
        if not file_path.is_file():
            _LOGGER.warning(
                "Apollo mmWave: bundled frontend asset %s is missing; the"
                " dashboard may not render until the integration is rebuilt.",
                name,
            )
            continue
        static_paths.append(
            StaticPathConfig(f"{STATIC_URL_BASE}/{name}", str(file_path), True)
        )
        js_urls.append(f"{STATIC_URL_BASE}/{name}?v={version}")

    if static_paths:
        await hass.http.async_register_static_paths(static_paths)
    for url in js_urls:
        frontend.add_extra_js_url(hass, url)


class StrategyDashboardConfig(LovelaceConfig):
    """A read-only Lovelace dashboard whose config is a single strategy.

    The frontend asks the ``lovelace`` websocket for this dashboard's config,
    which returns ``{"strategy": {"type": DASHBOARD_STRATEGY_TYPE}}``. The custom
    dashboard strategy then generates the views client-side on every load.
    """

    def __init__(self, hass: HomeAssistant, url_path: str, strategy_type: str) -> None:
        """Initialize with the url path and strategy type to serve."""
        super().__init__(hass, url_path, {CONF_URL_PATH: url_path})
        self._strategy_config: dict[str, Any] = {"strategy": {"type": strategy_type}}

    @property
    def mode(self) -> str:
        """Report storage mode so the frontend renders it as a normal dashboard."""
        return MODE_STORAGE

    async def async_get_info(self) -> dict[str, Any]:
        """Return minimal config info (a strategy generates the views)."""
        return {"mode": self.mode}

    async def async_load(self, force: bool) -> dict[str, Any]:
        """Return the strategy dashboard config."""
        return self._strategy_config

    async def async_json(self, force: bool) -> json_fragment:
        """Return the JSON representation of the strategy config."""
        return json_fragment(json_bytes(self._strategy_config))


async def async_register_dashboard(hass: HomeAssistant) -> bool:
    """
    Register the dedicated, strategy-backed "Apollo mmWave" sidebar dashboard.

    Returns True if the dashboard is present (newly registered or already there),
    False if the Lovelace environment wasn't ready and we should retry later.
    """
    try:
        lovelace_data = hass.data.get(LOVELACE_DATA)
        if lovelace_data is None:
            _LOGGER.debug("Apollo mmWave: lovelace data not available yet.")
            return False

        dashboards = getattr(lovelace_data, "dashboards", None)
        if not isinstance(dashboards, dict):
            _LOGGER.warning(
                "Apollo mmWave: unexpected lovelace dashboards shape; skipping"
                " auto-dashboard registration."
            )
            return True

        if DASHBOARD_URL_PATH in dashboards:
            _LOGGER.debug("Apollo mmWave: dashboard already registered.")
            return True

        dashboards[DASHBOARD_URL_PATH] = StrategyDashboardConfig(
            hass, DASHBOARD_URL_PATH, DASHBOARD_STRATEGY_TYPE
        )

        if not frontend.async_panel_exists(hass, DASHBOARD_URL_PATH):
            frontend.async_register_built_in_panel(
                hass,
                "lovelace",
                frontend_url_path=DASHBOARD_URL_PATH,
                sidebar_title=DASHBOARD_TITLE,
                sidebar_icon=DASHBOARD_ICON,
                require_admin=False,
                config={"mode": MODE_STORAGE},
                update=False,
            )
    except Exception:  # noqa: BLE001
        _LOGGER.warning(
            "Apollo mmWave: could not register the dashboard; continuing without"
            " it. You can add a dashboard with strategy type '%s' manually.",
            DASHBOARD_STRATEGY_TYPE,
            exc_info=True,
        )
        return True
    else:
        _LOGGER.info(
            "Apollo mmWave: registered the '%s' dashboard. Hide it from the"
            " sidebar in your profile if you prefer to lay out the cards"
            " yourself.",
            DASHBOARD_TITLE,
        )
        return True
