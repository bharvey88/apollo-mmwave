"""
Frontend wiring for Apollo mmWave.

This integration ships its own Lovelace frontend so users install ONE thing:

1. ``async_register_frontend_assets`` serves the bundled JS (the radar-tuning
   cards + dashboard strategy, and the vendored zone-mapper-card) from
   ``custom_components/apollo_mmwave/www`` and registers each bundle twice:

   - as a Lovelace *resource* (storage mode), so browser tabs that were open
     before the integration loaded pick the modules up on the next dashboard
     navigation — no page reload needed; and
   - as an extra JS URL, which covers YAML-mode Lovelace where the resource
     collection is read-only. Both point at the same versioned URL, so the
     browser's module cache loads the code exactly once.

2. ``async_register_dashboard`` registers a dedicated, strategy-backed
   "Apollo mmWave" dashboard in the sidebar. The dashboard config is simply
   ``{"strategy": {"type": "custom:apollo-radar-tuning"}}`` — the frontend
   strategy re-runs on every load, detecting each Apollo mmWave device and
   building one tab per device, so the dashboard self-updates as devices come
   and go (no one-time seeding, no stored card layout to drift).

Lovelace internals (``hass.data[LOVELACE_DATA].dashboards``) are not a public
contract, so dashboard registration is wrapped defensively: if the shape ever
changes we log and continue without the auto-dashboard rather than breaking
setup.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any, override

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace.const import (
    CONF_URL_PATH,
    LOVELACE_DATA,
    MODE_STORAGE,
)
from homeassistant.components.lovelace.dashboard import LovelaceConfig
from homeassistant.helpers.json import json_bytes, json_fragment
from homeassistant.loader import async_get_integration

from .const import (
    DASHBOARD_ICON,
    DASHBOARD_STRATEGY_TYPE,
    DASHBOARD_TITLE,
    DASHBOARD_URL_PATH,
    DATA_ASSETS_REGISTERED,
    DOMAIN,
    FRONTEND_DIR,
    JS_BUNDLES,
    STATIC_URL_BASE,
)

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


def _frontend_path() -> Path:
    """Return the absolute path to the bundled ``www`` directory."""
    return Path(__file__).parent / FRONTEND_DIR


async def async_register_frontend_assets(hass: HomeAssistant) -> None:
    """Serve and register the bundled JS so the cards/strategy load globally."""
    if hass.data.setdefault(DOMAIN, {}).get(DATA_ASSETS_REGISTERED):
        return

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
            StaticPathConfig(f"{STATIC_URL_BASE}/{name}", str(file_path), True)  # noqa: FBT003
        )
        js_urls.append(f"{STATIC_URL_BASE}/{name}?v={version}")

    if static_paths:
        await hass.http.async_register_static_paths(static_paths)
    for url in js_urls:
        frontend.add_extra_js_url(hass, url)
    await _async_register_lovelace_resources(hass, js_urls)
    hass.data[DOMAIN][DATA_ASSETS_REGISTERED] = True


async def _async_register_lovelace_resources(
    hass: HomeAssistant, js_urls: list[str]
) -> None:
    """
    Register the bundled JS in the Lovelace resource collection (storage mode).

    ``add_extra_js_url`` only reaches pages loaded *after* registration — a tab
    that was open before install never gets the module and the dashboard times
    out waiting for the strategy element. Resources are fetched over websocket
    whenever a Lovelace panel initializes, so they reach existing tabs too.

    The resource collection is not a public contract (same as the dashboards
    dict), so failures can't break setup — but they must be LOUD: browsers with
    a cached app shell never see extra JS urls, so without the resource the
    dashboard times out waiting for the strategy element and only a hard
    refresh recovers. Every non-success branch logs at warning with the reason.
    """
    try:
        lovelace_data = hass.data.get(LOVELACE_DATA)
        resources = getattr(lovelace_data, "resources", None)
        if resources is None:
            _LOGGER.warning(
                "Apollo mmWave: Lovelace resource collection unavailable"
                " (lovelace data: %s); cards may not load in already-open"
                " browser tabs until a hard refresh (Ctrl/Cmd+Shift+R).",
                type(lovelace_data).__name__,
            )
            return
        if not hasattr(resources, "async_create_item"):
            _LOGGER.warning(
                "Apollo mmWave: Lovelace resources are managed in YAML on this"
                " system (%s), so they can't be registered automatically. Add"
                " these module resources to your lovelace resources config,"
                " or the dashboard/cards won't load without a hard refresh: %s",
                type(resources).__name__,
                ", ".join(js_urls),
            )
            return
        if not getattr(resources, "loaded", True):
            await resources.async_load()
            resources.loaded = True

        existing: dict[str, dict[str, Any]] = {}
        for item in resources.async_items():
            url = str(item.get("url", ""))
            existing[url.partition("?")[0]] = item

        created: list[str] = []
        updated: list[str] = []
        for url in js_urls:
            item = existing.get(url.partition("?")[0])
            if item is None:
                await resources.async_create_item({"res_type": "module", "url": url})
                created.append(url)
            elif item.get("url") != url:
                # Same bundle, older ?v= cache-buster: point it at this version.
                await resources.async_update_item(item["id"], {"url": url})
                updated.append(url)
        if created or updated:
            _LOGGER.info(
                "Apollo mmWave: Lovelace resources registered (created: %s;"
                " updated: %s)",
                created or "none",
                updated or "none",
            )
        else:
            _LOGGER.debug("Apollo mmWave: Lovelace resources already current.")
    except Exception:  # noqa: BLE001
        _LOGGER.warning(
            "Apollo mmWave: could not register Lovelace resources; the"
            " dashboard/cards won't load in browsers with a cached app shell"
            " until a hard refresh. Please report this traceback:",
            exc_info=True,
        )


class StrategyDashboardConfig(LovelaceConfig):
    """
    A read-only Lovelace dashboard whose config is a single strategy.

    The frontend asks the ``lovelace`` websocket for this dashboard's config,
    which returns ``{"strategy": {"type": DASHBOARD_STRATEGY_TYPE}}``. The custom
    dashboard strategy then generates the views client-side on every load.
    """

    def __init__(self, hass: HomeAssistant, url_path: str, strategy_type: str) -> None:
        """Initialize with the url path and strategy type to serve."""
        super().__init__(hass, url_path, {CONF_URL_PATH: url_path})
        self._strategy_config: dict[str, Any] = {"strategy": {"type": strategy_type}}

    @property
    @override
    def mode(self) -> str:
        """Report storage mode so the frontend renders it as a normal dashboard."""
        return MODE_STORAGE

    @override
    async def async_get_info(self) -> dict[str, Any]:
        """Return minimal config info (a strategy generates the views)."""
        return {"mode": self.mode}

    @override
    async def async_load(self, force: bool) -> dict[str, Any]:
        """Return the strategy dashboard config."""
        return self._strategy_config

    @override
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


async def async_remove_dashboard(hass: HomeAssistant) -> None:
    """
    Remove the auto-registered dashboard and its sidebar panel.

    Called when the user turns the dashboard option off or unloads the entry.
    Only removes the dashboard if it is ours (a ``StrategyDashboardConfig``) so
    a user-created dashboard on the same url path is left alone.
    """
    try:
        lovelace_data = hass.data.get(LOVELACE_DATA)
        dashboards = getattr(lovelace_data, "dashboards", None)
        if isinstance(dashboards, dict) and isinstance(
            dashboards.get(DASHBOARD_URL_PATH), StrategyDashboardConfig
        ):
            dashboards.pop(DASHBOARD_URL_PATH, None)
            if frontend.async_panel_exists(hass, DASHBOARD_URL_PATH):
                frontend.async_remove_panel(hass, DASHBOARD_URL_PATH)
            _LOGGER.info("Apollo mmWave: removed the '%s' dashboard.", DASHBOARD_TITLE)
    except Exception:  # noqa: BLE001
        _LOGGER.warning(
            "Apollo mmWave: could not remove the dashboard; it may remain in"
            " the sidebar until Home Assistant restarts.",
            exc_info=True,
        )
