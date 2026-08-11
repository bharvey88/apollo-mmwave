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

2. ``async_register_dashboard`` creates an ordinary storage dashboard named
   "Apollo mmWave" in Lovelace's dashboards collection, and saves
   ``{"strategy": {"type": "custom:apollo-radar-tuning"}}`` as its config. The
   frontend strategy re-runs on every load, detecting each Apollo mmWave device
   and building one tab per device, so the dashboard self-updates as devices
   come and go (no one-time seeding, no stored card layout to drift).

   It is a real collection item rather than a synthetic read-only config so
   that users get the things Home Assistant already builds for storage
   dashboards: a title on the dashboards settings page, and a working "take
   control" for anyone who wants to customize it. Once someone takes control
   their config has no ``strategy`` key, which is exactly how we tell "still
   ours" from "now theirs" and never write over their work.

   The item is created once and then only ever has its *config* refreshed.
   Title, icon, sidebar visibility and admin-only belong to the user from the
   moment the row exists, so they are written at creation and never again. The
   "auto-create dashboard" option is the single source of truth for whether the
   dashboard exists; nothing else removes it, and a reload leaves it alone.

Lovelace internals (``hass.data[LOVELACE_DATA]`` and the dashboards collection
behind the ``lovelace/dashboards`` websocket API) are not a public contract, so
every touch is wrapped defensively: if the shape ever changes we log and
continue without the auto-dashboard rather than breaking setup.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace.const import (
    CONF_ICON,
    CONF_REQUIRE_ADMIN,
    CONF_SHOW_IN_SIDEBAR,
    CONF_TITLE,
    CONF_URL_PATH,
    LOVELACE_DATA,
    ConfigNotFound,
)
from homeassistant.components.websocket_api.const import (
    DOMAIN as WEBSOCKET_API_DOMAIN,
)
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


# The websocket command whose handler is bound to the live dashboards
# collection. See _dashboards_collection for why we go the long way round.
_WS_DASHBOARDS_LIST = "lovelace/dashboards/list"


def _dashboards_collection(hass: HomeAssistant) -> Any | None:
    """
    Return Lovelace's storage dashboards collection, or None if unreachable.

    Home Assistant 2025.9 keeps the collection in a local variable inside
    lovelace's own ``async_setup``; ``hass.data[LOVELACE_DATA]`` carries only
    mode/dashboards/resources/yaml_dashboards. The one live reference is the
    websocket CRUD object bound to the ``lovelace/dashboards/*`` commands, so
    borrow it from the command registry. Constructing our own
    ``DashboardsCollection`` is not an alternative: each instance rewrites the
    whole item list into the shared store, so two of them delete each other's
    dashboards.
    """
    lovelace_data = hass.data.get(LOVELACE_DATA)
    if lovelace_data is None:
        return None
    # Preferred path if a future release ever puts it on the dataclass.
    collection = getattr(lovelace_data, "dashboards_collection", None)
    if collection is not None:
        return collection
    registered = hass.data.get(WEBSOCKET_API_DOMAIN) or {}
    entry = registered.get(_WS_DASHBOARDS_LIST)
    handler = entry[0] if isinstance(entry, tuple) else entry
    return getattr(getattr(handler, "__self__", None), "storage_collection", None)


def _dashboard_item(collection: Any) -> dict[str, Any] | None:
    """Return the collection item sitting on our url path, if there is one."""
    return next(
        (
            item
            for item in collection.async_items()
            if item.get(CONF_URL_PATH) == DASHBOARD_URL_PATH
        ),
        None,
    )


async def _async_stored_config(hass: HomeAssistant) -> dict[str, Any] | None:
    """Return the dashboard's stored Lovelace config, or None if it has none."""
    config = hass.data[LOVELACE_DATA].dashboards.get(DASHBOARD_URL_PATH)
    if config is None:
        return None
    try:
        return await config.async_load(force=False)
    except ConfigNotFound:
        return None


def _is_ours(stored: dict[str, Any] | None) -> bool:
    """
    Report whether a stored config is still the strategy we generate.

    Anything else on this url path belongs to the user: they either took
    control (which strips the ``strategy`` key and replaces it with views) or
    built their own dashboard here. Both must survive us untouched.
    """
    if not isinstance(stored, dict):
        return False
    strategy = stored.get("strategy")
    return (
        isinstance(strategy, dict) and strategy.get("type") == DASHBOARD_STRATEGY_TYPE
    )


def _desired_config(devices: list[str] | None) -> dict[str, Any]:
    """Build the strategy config for the given device selection."""
    strategy: dict[str, Any] = {"type": DASHBOARD_STRATEGY_TYPE}
    if devices:
        # Explicit selection: the strategy shows exactly these devices, online
        # or not, instead of auto-detecting live ones.
        strategy["devices"] = list(devices)
    return {"strategy": strategy}


async def async_register_dashboard(
    hass: HomeAssistant, devices: list[str] | None = None
) -> bool:
    """
    Create the "Apollo mmWave" dashboard as a normal storage dashboard.

    Creates the collection item if the "auto-create dashboard" option is on and
    it is missing, then keeps the strategy config current (the explicit device
    selection can change). Never touches a dashboard that is not ours. Returns
    False only if Lovelace's internals could not be reached at all.
    """
    try:
        collection = _dashboards_collection(hass)
        if collection is None:
            _LOGGER.warning(
                "Apollo mmWave: could not reach Lovelace's dashboards collection,"
                " so the '%s' dashboard was not created. You can add a dashboard"
                " with strategy type '%s' manually.",
                DASHBOARD_TITLE,
                DASHBOARD_STRATEGY_TYPE,
            )
            return False

        # Ownership is decided by who created the row, not by what is stored on
        # it. A dashboard someone else made has no config until they save one,
        # and inferring "unowned" from that empty config would let us write our
        # strategy over their work and then delete it as if it were ours.
        created = False
        if _dashboard_item(collection) is None:
            if DASHBOARD_URL_PATH in hass.data[LOVELACE_DATA].dashboards:
                # A YAML dashboard holds the url path. Lovelace refuses a second
                # panel there, and it isn't ours to replace.
                _LOGGER.debug(
                    "Apollo mmWave: another dashboard already owns '%s'; skipping.",
                    DASHBOARD_URL_PATH,
                )
                return True
            await collection.async_create_item(
                {
                    CONF_URL_PATH: DASHBOARD_URL_PATH,
                    CONF_TITLE: DASHBOARD_TITLE,
                    CONF_ICON: DASHBOARD_ICON,
                    CONF_SHOW_IN_SIDEBAR: True,
                    CONF_REQUIRE_ADMIN: False,
                }
            )
            created = True
            _LOGGER.info(
                "Apollo mmWave: created the '%s' dashboard. The 'auto-create"
                " dashboard' option in the integration's settings is what"
                " controls it: turn that off to remove it and keep it removed."
                " You can also hide it from your own sidebar in your profile if"
                " you would rather lay the cards out yourself.",
                DASHBOARD_TITLE,
            )

        stored = await _async_stored_config(hass)
        if not created and not _is_ours(stored):
            _LOGGER.debug(
                "Apollo mmWave: the '%s' dashboard is not ours to write to;"
                " leaving its config alone.",
                DASHBOARD_TITLE,
            )
            return True

        desired = _desired_config(devices)
        if stored == desired:
            _LOGGER.debug("Apollo mmWave: dashboard already registered.")
            return True
        dashboard = hass.data[LOVELACE_DATA].dashboards[DASHBOARD_URL_PATH]
        # async_save fires the lovelace_updated event, so open tabs pick up a
        # changed device selection without a reload.
        await dashboard.async_save(desired)
    except Exception:  # noqa: BLE001
        _LOGGER.warning(
            "Apollo mmWave: could not register the dashboard; continuing without"
            " it. You can add a dashboard with strategy type '%s' manually.",
            DASHBOARD_STRATEGY_TYPE,
            exc_info=True,
        )
        return True
    else:
        return True


async def async_remove_dashboard(hass: HomeAssistant) -> None:
    """
    Remove the auto-created dashboard.

    Called only when the user turns the "auto-create dashboard" option off, or
    when the config entry is removed. An integration reload deliberately does
    not come through here: deleting and recreating the item would throw away
    whatever the user renamed, re-iconed, or hid on the dashboards settings
    page. Deleting the collection item is what removes the sidebar panel and
    the stored config; lovelace does both from its own collection listener.
    Only a config that is still our generated strategy is deleted, so a
    dashboard the user built or took control of here is left standing.
    """
    try:
        collection = _dashboards_collection(hass)
        if collection is None:
            return
        item = _dashboard_item(collection)
        if item is None:
            return
        if not _is_ours(await _async_stored_config(hass)):
            _LOGGER.debug(
                "Apollo mmWave: the '%s' dashboard is no longer ours; leaving it.",
                DASHBOARD_TITLE,
            )
            return
        await collection.async_delete_item(item["id"])
        _LOGGER.info("Apollo mmWave: removed the '%s' dashboard.", DASHBOARD_TITLE)
    except Exception:  # noqa: BLE001
        _LOGGER.warning(
            "Apollo mmWave: could not remove the dashboard; it may remain in"
            " the sidebar until Home Assistant restarts.",
            exc_info=True,
        )
