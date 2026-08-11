"""Apollo mmWave: zone-mapping backend + bundled radar-tuning dashboard."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import voluptuous as vol
from homeassistant.const import Platform
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_send

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine

    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import HomeAssistant, ServiceCall
    from homeassistant.helpers.typing import ConfigType

    from .store import ZoneStore

from .const import (
    ATTR_CX,
    ATTR_CY,
    ATTR_DATA,
    ATTR_NAME,
    ATTR_POINTS,
    ATTR_ROTATION_DEG,
    ATTR_RX,
    ATTR_RY,
    ATTR_SHAPE,
    ATTR_X_MAX,
    ATTR_X_MIN,
    ATTR_Y_MAX,
    ATTR_Y_MIN,
    CONF_AUTO_CREATE_VIEW,
    CONF_DASHBOARD_DEVICES,
    DATA_STORE,
    DEFAULT_AUTO_CREATE_VIEW,
    DOMAIN,
    EVENT_ZONE_UPDATED,
    POLYGON_MAX_POINTS,
    POLYGON_MIN_POINTS,
    SERVICE_UPDATE_ZONE,
    SHAPE_ELLIPSE,
    SHAPE_NONE,
    SHAPE_POLYGON,
    SHAPE_RECT,
    SIGNAL_ZONES_UPDATED,
    STORE_ENTITIES,
    STORE_ZONES,
    SUPPORTED_SHAPES,
    WARN_ELLIPSE_INVALID,
    WARN_ELLIPSE_NON_POSITIVE,
    WARN_POLY_INSUFFICIENT,
    WARN_POLY_TRUNCATING,
    WARN_RECT_INVALID,
    WARN_RECT_NON_NUM,
)

# NOTE: `.frontend` is imported lazily inside the setup path (not here) so that
# importing this package for the config flow doesn't pull in Lovelace internals
# in the event loop (avoids the blocking-import warning).

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

PLATFORMS = [Platform.BINARY_SENSOR, Platform.SENSOR]


def get_store(hass: HomeAssistant) -> ZoneStore:
    """Return the loaded ZoneStore (setup guarantees it exists)."""
    return hass.data[DOMAIN][DATA_STORE]


def _coerce_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _sanitize_rotation(rotation: Any) -> int | None:
    if rotation is None:
        return None
    try:
        value = round(float(rotation))
    except (TypeError, ValueError):
        return None
    return max(-180, min(180, value))


def _coerce_zone_name(name: Any) -> str | None:
    if name is None:
        return None
    if isinstance(name, str):
        return name
    return str(name)


def _normalize_entities(entities: Any) -> list[dict[str, str]] | None:
    if entities is None:
        return None
    if not isinstance(entities, list):
        return None
    normalized: list[dict[str, str]] = []
    for pair in entities:
        if not isinstance(pair, dict):
            continue
        x_id = pair.get("x")
        y_id = pair.get("y")
        if isinstance(x_id, str) and isinstance(y_id, str):
            normalized.append({"x": x_id, "y": y_id})
    return normalized


def _normalize_zone_payload(
    shape: str, data: Any, zone_id: int, location: str
) -> dict[str, Any] | None:
    if shape == SHAPE_NONE or data is None:
        return None
    if shape == SHAPE_RECT:
        return _normalize_rect(data, zone_id, location)
    if shape == SHAPE_ELLIPSE:
        return _normalize_ellipse(data, zone_id, location)
    if shape == SHAPE_POLYGON:
        return _normalize_polygon(data, zone_id, location)
    return None


def _normalize_rect(data: Any, zone_id: int, location: str) -> dict[str, Any] | None:
    if not isinstance(data, dict):
        return None
    x_min = _coerce_float(data.get(ATTR_X_MIN))
    x_max = _coerce_float(data.get(ATTR_X_MAX))
    y_min = _coerce_float(data.get(ATTR_Y_MIN))
    y_max = _coerce_float(data.get(ATTR_Y_MAX))
    if x_min is None or x_max is None or y_min is None or y_max is None:
        _LOGGER.warning(WARN_RECT_NON_NUM, zone_id, location)
        return None
    x_min_i = round(x_min)
    x_max_i = round(x_max)
    y_min_i = round(y_min)
    y_max_i = round(y_max)
    if not (x_min_i < x_max_i and y_min_i < y_max_i):
        _LOGGER.warning(WARN_RECT_INVALID, zone_id, location)
        return None
    return {
        **data,
        ATTR_X_MIN: x_min_i,
        ATTR_X_MAX: x_max_i,
        ATTR_Y_MIN: y_min_i,
        ATTR_Y_MAX: y_max_i,
    }


def _normalize_ellipse(data: Any, zone_id: int, location: str) -> dict[str, Any] | None:
    if not isinstance(data, dict):
        return None
    cx = _coerce_float(data.get(ATTR_CX))
    cy = _coerce_float(data.get(ATTR_CY))
    rx = _coerce_float(data.get(ATTR_RX))
    ry = _coerce_float(data.get(ATTR_RY))
    if cx is None or cy is None or rx is None or ry is None:
        _LOGGER.warning(WARN_ELLIPSE_INVALID, zone_id, location)
        return None
    if rx <= 0 or ry <= 0:
        _LOGGER.warning(WARN_ELLIPSE_NON_POSITIVE, zone_id, location)
        return None
    return {
        ATTR_CX: round(cx),
        ATTR_CY: round(cy),
        ATTR_RX: max(1, round(rx)),
        ATTR_RY: max(1, round(ry)),
    }


def _normalize_polygon(data: Any, zone_id: int, location: str) -> dict[str, Any] | None:
    if not isinstance(data, dict):
        return None
    points = data.get(ATTR_POINTS)
    if not isinstance(points, list) or len(points) < POLYGON_MIN_POINTS:
        _LOGGER.warning(WARN_POLY_INSUFFICIENT, zone_id, location)
        return None
    total_points = len(points)
    trimmed = list(points[:POLYGON_MAX_POINTS])
    if total_points > POLYGON_MAX_POINTS:
        _LOGGER.warning(
            WARN_POLY_TRUNCATING, zone_id, location, total_points, POLYGON_MAX_POINTS
        )
    normalized_points = []
    for point in trimmed:
        if not isinstance(point, dict):
            continue
        x_float = _coerce_float(point.get("x"))
        y_float = _coerce_float(point.get("y"))
        if x_float is None or y_float is None:
            continue
        normalized_points.append({"x": round(x_float), "y": round(y_float)})
    if len(normalized_points) < POLYGON_MIN_POINTS:
        _LOGGER.warning(WARN_POLY_INSUFFICIENT, zone_id, location)
        return None
    return {**data, ATTR_POINTS: normalized_points}


def _zone_entity_unique_ids(device_id: str, zone_id: int) -> tuple[str, str]:
    return (
        f"{device_id}_zone_{zone_id}",
        f"{device_id}_zone_{zone_id}_presence",
    )


def _update_registry_names(
    hass: HomeAssistant, device_id: str, zone_id: int, zone_name: str
) -> None:
    registry = er.async_get(hass)
    sensor_uid, presence_uid = _zone_entity_unique_ids(device_id, zone_id)

    sensor_eid = registry.async_get_entity_id("sensor", DOMAIN, sensor_uid)
    if sensor_eid:
        base = f"Zone {zone_id}"
        registry.async_update_entity(
            sensor_eid, name=f"{base} - {zone_name}" if zone_name else base
        )

    presence_eid = registry.async_get_entity_id("binary_sensor", DOMAIN, presence_uid)
    if presence_eid:
        base = f"Zone {zone_id} presence"
        registry.async_update_entity(
            presence_eid, name=f"{base} - {zone_name}" if zone_name else base
        )


def _remove_zone_entities(hass: HomeAssistant, device_id: str, zone_id: int) -> None:
    registry = er.async_get(hass)
    sensor_uid, presence_uid = _zone_entity_unique_ids(device_id, zone_id)

    sensor_eid = registry.async_get_entity_id("sensor", DOMAIN, sensor_uid)
    if sensor_eid:
        registry.async_remove(sensor_eid)

    presence_eid = registry.async_get_entity_id("binary_sensor", DOMAIN, presence_uid)
    if presence_eid:
        registry.async_remove(presence_eid)


def _notify_zones_updated(hass: HomeAssistant, device_id: str) -> None:
    """Persist and fan out a zone change (internal signal + public event)."""
    get_store(hass).async_delay_save()
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    hass.bus.async_fire(EVENT_ZONE_UPDATED, {"device_id": device_id})


def _build_update_zone_handler(
    hass: HomeAssistant,
) -> Callable[[ServiceCall], Coroutine[Any, Any, None]]:
    async def handle_update_zone(call: ServiceCall) -> None:
        # The service field is still called `location`, but the store is keyed
        # by device id now, so that is what it has to carry. The field itself is
        # renamed when the service is reworked.
        location_raw = call.data.get("location")
        if not isinstance(location_raw, str) or not location_raw.strip():
            _LOGGER.debug(
                "Apollo mmWave: rejected update with invalid device id: %s",
                location_raw,
            )
            return

        device_id = location_raw.strip()
        zone_id = call.data.get("zone_id")
        shape = call.data.get("shape")
        data = call.data.get("data")
        entities = _normalize_entities(call.data.get("entities"))
        rotation = _sanitize_rotation(call.data.get(ATTR_ROTATION_DEG))
        zone_name = _coerce_zone_name(call.data.get("name"))
        delete_zone = bool(call.data.get("delete"))

        store = get_store(hass)
        device = store.device(device_id)

        if rotation is not None:
            device[ATTR_ROTATION_DEG] = rotation

        if entities is not None:
            device[STORE_ENTITIES] = entities

        if delete_zone and zone_id is not None:
            device[STORE_ZONES].pop(zone_id, None)
            _remove_zone_entities(hass, device_id, zone_id)
            _notify_zones_updated(hass, device_id)
            return

        if zone_id is None or shape is None:
            # Rotation/entities-only update, or a rename without geometry.
            if zone_id is not None and zone_name is not None:
                zone_entry = store.zone(device_id, zone_id)
                if zone_entry is not None:
                    zone_entry[ATTR_NAME] = zone_name
                    _update_registry_names(hass, device_id, zone_id, zone_name)
            _notify_zones_updated(hass, device_id)
            return

        if shape not in SUPPORTED_SHAPES:
            _LOGGER.debug(
                "Apollo mmWave: unsupported shape '%s' for device '%s'",
                shape,
                device_id,
            )
            return

        zone_entry = {
            ATTR_SHAPE: shape,
            ATTR_DATA: _normalize_zone_payload(shape, data, zone_id, device_id),
        }

        if zone_name is not None:
            zone_entry[ATTR_NAME] = zone_name
        else:
            existing = store.zone(device_id, zone_id)
            if existing is not None and isinstance(existing.get(ATTR_NAME), str):
                zone_entry[ATTR_NAME] = existing[ATTR_NAME]

        device[STORE_ZONES][zone_id] = zone_entry

        if zone_name is not None:
            _update_registry_names(hass, device_id, zone_id, zone_name)

        _notify_zones_updated(hass, device_id)

    return handle_update_zone


UPDATE_ZONE_SERVICE_SCHEMA = vol.Schema(
    {
        vol.Required("location"): cv.string,
        vol.Optional("zone_id"): cv.positive_int,
        vol.Optional("shape"): vol.In(list(SUPPORTED_SHAPES)),
        vol.Optional("data"): vol.Any(None, dict),
        vol.Optional(ATTR_ROTATION_DEG): vol.Coerce(float),
        vol.Optional("name"): cv.string,
        vol.Optional("delete"): cv.boolean,
        vol.Optional("entities"): vol.All(
            cv.ensure_list,
            [
                vol.Schema(
                    {
                        vol.Required("x"): cv.entity_id,
                        vol.Required("y"): cv.entity_id,
                    },
                    extra=vol.ALLOW_EXTRA,
                )
            ],
        ),
    }
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Config-entry-only integration; nothing to do for YAML."""
    _ = (hass, config)
    return True


def _auto_create_dashboard_enabled(entry: ConfigEntry) -> bool:
    value = entry.options.get(CONF_AUTO_CREATE_VIEW, DEFAULT_AUTO_CREATE_VIEW)
    return bool(value)


async def _async_apply_dashboard_option(
    hass: HomeAssistant, entry: ConfigEntry
) -> None:
    """Register or remove the sidebar dashboard to match the current options."""
    # Lazy import: keeps Lovelace internals out of the config-flow import path.
    from .frontend import (  # noqa: PLC0415
        async_register_dashboard,
        async_remove_dashboard,
    )

    if _auto_create_dashboard_enabled(entry):
        devices = entry.options.get(CONF_DASHBOARD_DEVICES, [])
        await async_register_dashboard(
            hass, list(devices) if isinstance(devices, list) else []
        )
    else:
        await async_remove_dashboard(hass)


async def _async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Apply option changes immediately (no restart needed)."""
    await _async_apply_dashboard_option(hass, entry)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """
    Set up Apollo mmWave from a config entry.

    Loads (or migrates) the zone store, registers the update service, forwards
    the sensor/binary_sensor platforms, serves the bundled frontend, and
    registers the dedicated Apollo mmWave dashboard.

    The frontend assets are registered unconditionally — the cards and strategy
    must work even when the auto-dashboard is turned off (users laying out the
    cards themselves). Only the sidebar dashboard is gated by the option.
    """
    from .migration import (  # noqa: PLC0415
        async_migrate_legacy,
        async_migrate_unique_ids,
    )
    from .store import ZoneStore  # noqa: PLC0415

    store = ZoneStore(hass)
    if not await store.async_load():
        await async_migrate_legacy(hass, store)
    # Before the platforms: an entity still on a pre-2.0 unique id would
    # otherwise be abandoned and recreated fresh, losing its name and area.
    await async_migrate_unique_ids(hass, store)
    hass.data.setdefault(DOMAIN, {})[DATA_STORE] = store

    # Before the platforms, so no entity can resolve pairs without the cache in
    # place and then hold a stale answer.
    from .ld2450 import async_track_target_pairs  # noqa: PLC0415

    entry.async_on_unload(async_track_target_pairs(hass))

    hass.services.async_register(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        _build_update_zone_handler(hass),
        schema=UPDATE_ZONE_SERVICE_SCHEMA,
    )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # `frontend`, `http`, and `lovelace` are manifest dependencies, so they are
    # ready by now — register immediately. Waiting for EVENT_HOMEASSISTANT_STARTED
    # (the old behavior) left a window where a page load during startup missed
    # the extra JS module and the dashboard timed out waiting for the strategy.
    from .frontend import async_register_frontend_assets  # noqa: PLC0415

    await async_register_frontend_assets(hass)
    await _async_apply_dashboard_option(hass, entry)

    entry.async_on_unload(entry.add_update_listener(_async_options_updated))

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload the entry: platforms, service, dashboard; flush the store."""
    from .frontend import async_remove_dashboard  # noqa: PLC0415

    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        hass.services.async_remove(DOMAIN, SERVICE_UPDATE_ZONE)
        await async_remove_dashboard(hass)
        store = hass.data.get(DOMAIN, {}).pop(DATA_STORE, None)
        if store is not None:
            await store.async_save()
    return unloaded


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Delete the zone store when the integration is removed."""
    _ = entry
    from .store import ZoneStore  # noqa: PLC0415

    await ZoneStore(hass).async_remove()
