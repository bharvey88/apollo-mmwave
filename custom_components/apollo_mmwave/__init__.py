"""Apollo mmWave: zone-mapping backend + bundled radar-tuning dashboard."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import voluptuous as vol
from homeassistant.const import Platform
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.util import slugify

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
    STORE_LABEL,
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

# hass.data flag so the `location` deprecation is logged once per run. The card
# calls update_zone on every rotation drag, which would otherwise flood the log.
_DATA_LOCATION_WARNED = "location_deprecation_warned"


def get_store(hass: HomeAssistant) -> ZoneStore:
    """Return the loaded ZoneStore (setup guarantees it exists)."""
    return hass.data[DOMAIN][DATA_STORE]


def _coerce_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except TypeError, ValueError:
        return None


def _sanitize_rotation(rotation: Any) -> int | None:
    if rotation is None:
        return None
    try:
        value = round(float(rotation))
    except TypeError, ValueError:
        return None
    return max(-180, min(180, value))


def _coerce_zone_name(name: Any) -> str | None:
    if name is None:
        return None
    if isinstance(name, str):
        return name
    return str(name)


def _normalize_entities(entities: Any) -> list[dict[str, str]] | None:
    """
    Normalize a pairs list. An EMPTY list means "no change", not "erase".

    Cards send their whole in-memory pair list on every zone edit, and a card
    that has not finished loading sends an empty one. Treating that as an erase
    destroyed real user configuration (two reported cases). Emptying the list is
    only ever done through `clear_entities: true`, which is explicit.
    """
    if not isinstance(entities, list) or not entities:
        return None
    normalized: list[dict[str, str]] = []
    for pair in entities:
        if not isinstance(pair, dict):
            continue
        x_id = pair.get("x")
        y_id = pair.get("y")
        if isinstance(x_id, str) and isinstance(y_id, str):
            normalized.append({"x": x_id, "y": y_id})
    # Same rule once validation is done: nothing left is still not an erase.
    return normalized or None


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


def _is_generated_name(name: str | None, base: str) -> bool:
    """Report whether a registry name is one this integration wrote."""
    return name is None or name == base or name.startswith(f"{base} - ")


def _update_registry_names(
    hass: HomeAssistant, device_id: str, zone_id: int, zone_name: str
) -> None:
    # The registry `name` is the same field the entity settings dialog edits.
    # A name the user typed there is theirs: a zone rename only rewrites a
    # name that is still one of ours, so "Kitchen door" stays "Kitchen door".
    registry = er.async_get(hass)
    sensor_uid, presence_uid = _zone_entity_unique_ids(device_id, zone_id)

    for domain, unique_id, base in (
        ("sensor", sensor_uid, f"Zone {zone_id}"),
        ("binary_sensor", presence_uid, f"Zone {zone_id} presence"),
    ):
        entity_id = registry.async_get_entity_id(domain, DOMAIN, unique_id)
        if not entity_id:
            continue
        entry = registry.async_get(entity_id)
        if entry is not None and not _is_generated_name(entry.name, base):
            continue
        registry.async_update_entity(
            entity_id, name=f"{base} - {zone_name}" if zone_name else base
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


def _device_id_for_label(store: ZoneStore, location: Any) -> str | None:
    """Resolve a deprecated `location` value against the stored device labels."""
    # Matching is slug-based so a v1 automation still hits its device however the
    # name was capitalized or punctuated. Only stored labels are consulted: the
    # service must not invent a target the store has never heard of.
    if not isinstance(location, str) or not location.strip():
        return None
    wanted = slugify(location)
    for device_id, entry in store.devices.items():
        label = entry.get(STORE_LABEL)
        if isinstance(label, str) and slugify(label) == wanted:
            return device_id
    return None


def _device_is_registered(hass: HomeAssistant, device_id: str) -> bool:
    """Report whether the id still names a device Home Assistant knows about."""
    # Every path into `store.device()` goes through this. That call is a
    # setdefault, so an id no Home Assistant device answers to becomes a phantom
    # store entry: persisted forever, rendering nothing, reported as vanished
    # zones.
    return dr.async_get(hass).async_get(device_id) is not None


def _device_id_from_call(hass: HomeAssistant, call: ServiceCall) -> str | None:
    """Read `device_id` off a call, or None if it names no real device."""
    raw = call.data.get("device_id")
    # An automation written with `target:` instead of `data:` arrives with
    # device_id as a list, and hand-written YAML does that legitimately. More
    # than one is refused rather than guessed at: a zone belongs to one radar.
    if isinstance(raw, list):
        if len(raw) > 1:
            _LOGGER.warning(
                "Apollo mmWave: update_zone was targeted at %d devices, but a zone"
                " belongs to exactly one radar; nothing was changed.",
                len(raw),
            )
            return None
        raw = raw[0] if raw else None
    if not isinstance(raw, str) or not raw.strip():
        _LOGGER.warning(
            "Apollo mmWave: update_zone was given an empty device_id;"
            " nothing was changed."
        )
        return None
    device_id = raw.strip()
    # A stale id from a copied automation, or from a radar that was removed and
    # re-added, must not reach the store.
    if not _device_is_registered(hass, device_id):
        _LOGGER.warning(
            "Apollo mmWave: update_zone device id '%s' matches no Home Assistant"
            " device; nothing was changed.",
            device_id,
        )
        return None
    return device_id


def _device_id_for_deprecated_location(
    hass: HomeAssistant, store: ZoneStore, call: ServiceCall
) -> str | None:
    """Resolve the v1 `location` alias, warning about it once per run."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    if not domain_data.get(_DATA_LOCATION_WARNED):
        domain_data[_DATA_LOCATION_WARNED] = True
        _LOGGER.warning(
            "Apollo mmWave: the update_zone 'location' field is deprecated and will"
            " be removed in a future release; pass 'device_id' instead."
        )
    location = call.data.get("location")
    resolved = _device_id_for_label(store, location)
    if resolved is None:
        _LOGGER.warning(
            "Apollo mmWave: update_zone location '%s' matches no known radar;"
            " nothing was changed.",
            location,
        )
        return None
    # Nothing prunes a store entry when its device leaves the device registry,
    # so a label outlives the radar it named and keeps resolving to a dead id.
    # Writing through it would rebuild the same phantom entry an unknown
    # device_id does, just by the other door.
    if not _device_is_registered(hass, resolved):
        _LOGGER.warning(
            "Apollo mmWave: the radar behind update_zone location '%s' (device"
            " %s) is no longer in Home Assistant, so nothing was changed. If you"
            " re-added it, re-draw its zones and switch the automation to"
            " device_id.",
            location,
            resolved,
        )
        return None
    return resolved


def _resolve_target_device(
    hass: HomeAssistant, store: ZoneStore, call: ServiceCall
) -> str | None:
    """Return the device id a call targets, or None if it names no known radar."""
    if "device_id" in call.data:
        return _device_id_from_call(hass, call)
    if "location" in call.data:
        return _device_id_for_deprecated_location(hass, store, call)
    _LOGGER.warning(
        "Apollo mmWave: update_zone needs a device_id; nothing was changed."
    )
    return None


def _apply_entity_pairs(device: dict[str, Any], call: ServiceCall) -> None:
    """Write the tracked pair list, but only when the call really asks for it."""
    # `clear_entities` wins over `entities` when a call carries both: it is the
    # only explicit way to empty the list, so it must not be second-guessed.
    if call.data.get("clear_entities"):
        device[STORE_ENTITIES] = []
        return
    entities = _normalize_entities(call.data.get("entities"))
    if entities is not None:
        device[STORE_ENTITIES] = entities


def _call_changes_something(
    call: ServiceCall, device_id: str, rotation: int | None
) -> bool:
    """Refuse the schema-legal calls that would change nothing, and say why."""
    zone_id = call.data.get("zone_id")
    if call.data.get("delete") and zone_id is None:
        _LOGGER.warning(
            "Apollo mmWave: update_zone was asked to delete a zone on device"
            " '%s' without a zone_id; nothing was changed.",
            device_id,
        )
        return False
    if call.data.get("data") is not None and call.data.get("shape") is None:
        _LOGGER.warning(
            "Apollo mmWave: update_zone for device '%s' carried zone data"
            " without a shape, so the data was ignored.",
            device_id,
        )
    if (
        rotation is not None
        or call.data.get("clear_entities")
        or _normalize_entities(call.data.get("entities")) is not None
        or zone_id is not None
    ):
        return True
    # `store.device()` is a setdefault: reading it for this call would mint a
    # permanent, empty entry for a radar the call never configured.
    _LOGGER.warning(
        "Apollo mmWave: update_zone for device '%s' carried nothing to change;"
        " nothing was changed.",
        device_id,
    )
    return False


def _build_update_zone_handler(
    hass: HomeAssistant,
) -> Callable[[ServiceCall], Coroutine[Any, Any, None]]:
    async def handle_update_zone(call: ServiceCall) -> None:
        store = get_store(hass)
        device_id = _resolve_target_device(hass, store, call)
        if device_id is None:
            return

        zone_id = call.data.get("zone_id")
        shape = call.data.get("shape")
        data = call.data.get("data")
        rotation = _sanitize_rotation(call.data.get(ATTR_ROTATION_DEG))
        zone_name = _coerce_zone_name(call.data.get("name"))
        delete_zone = bool(call.data.get("delete"))

        if not _call_changes_something(call, device_id, rotation):
            return

        device = store.device(device_id)

        if rotation is not None:
            device[ATTR_ROTATION_DEG] = rotation

        _apply_entity_pairs(device, call)

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


UPDATE_ZONE_SERVICE_SCHEMA = vol.All(
    # `location` is the v1 spelling, kept for one release so existing automations
    # keep working. Exactly one of the two has to be there.
    cv.has_at_least_one_key("device_id", "location"),
    vol.Schema(
        {
            # A list is the shape a `target:` block produces; see
            # `_device_id_from_call`.
            vol.Optional("device_id"): vol.Any(cv.string, [cv.string]),
            vol.Optional("location"): cv.string,
            vol.Optional("clear_entities"): cv.boolean,
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
        },
        extra=vol.PREVENT_EXTRA,
    ),
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
        async_import_zone_mapper,
        async_migrate_legacy,
        async_migrate_unique_ids,
    )
    from .store import ZoneStore  # noqa: PLC0415

    store = ZoneStore(hass)
    if not await store.async_load():
        await async_migrate_legacy(hass, store)
        # Second, so our own data is the first writer on any zone id the two
        # setups share. Both ran against the same radars for these users.
        await async_import_zone_mapper(hass, store)
        await store.async_save()
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

    # How the card reads its configuration. Registering the commands is
    # idempotent and they are never unregistered (Home Assistant has no API for
    # it), so the teardown only closes the subscriptions this entry owns.
    from .websocket import async_register as async_register_websocket  # noqa: PLC0415

    entry.async_on_unload(async_register_websocket(hass))

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
    """
    Unload the entry: platforms and service; flush the store.

    The dashboard deliberately survives an unload. It is a real storage
    dashboard now, so removing it here would delete whatever the user renamed,
    re-iconed, or hid on the dashboards settings page every time the
    integration reloaded (which HACS does on every update). The "auto-create
    dashboard" option owns its lifetime instead.
    """
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        hass.services.async_remove(DOMAIN, SERVICE_UPDATE_ZONE)
        store = hass.data.get(DOMAIN, {}).pop(DATA_STORE, None)
        if store is not None:
            await store.async_save()
    return unloaded


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Delete the dashboard and the zone store when the integration is removed."""
    _ = entry
    from .frontend import async_remove_dashboard  # noqa: PLC0415
    from .store import ZoneStore  # noqa: PLC0415

    await async_remove_dashboard(hass)
    await ZoneStore(hass).async_remove()
