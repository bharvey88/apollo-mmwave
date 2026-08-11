"""
Websocket API: how the zone card reads its configuration.

Before 2.0 the card built ``sensor.apollo_mmwave_<slug>_zone_<n>`` out of a
display name and read zone geometry from that entity's state attributes. That
tied configuration to entity naming and to entity availability: an unavailable
entity has its attributes stripped, so the card read an empty config and wrote
the emptiness back over the real one. Renaming the radar orphaned everything,
and a radar could not be configured before it had a zone, because the zone
entity was the storage.

These two commands are the replacement. The store is the single source of
truth, the Home Assistant device id is the key, and nothing here builds an
entity id.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from .const import (
    ATTR_ROTATION_DEG,
    DATA_STORE,
    DOMAIN,
    SIGNAL_ZONES_UPDATED,
    STORE_ENTITIES,
    STORE_LABEL,
    STORE_ZONES,
)
from .ld2450 import resolve_target_pairs

if TYPE_CHECKING:
    from homeassistant.components.websocket_api import ActiveConnection
    from homeassistant.core import CALLBACK_TYPE, HomeAssistant

TYPE_GET = f"{DOMAIN}/zones/get"
TYPE_SUBSCRIBE = f"{DOMAIN}/zones/subscribe"

# Detected pairs the user has not chosen, offered so the card can say "using the
# radar's own targets" instead of demanding a manual pick.
KEY_SUGGESTED_ENTITIES = "suggested_entities"

# Live subscriptions, so unloading the config entry can close them. Commands
# themselves are never unregistered: Home Assistant has no API for that.
DATA_SUBSCRIPTIONS = "ws_subscriptions"

ERR_NOT_LOADED = "not_loaded"


@callback
def async_register(hass: HomeAssistant) -> CALLBACK_TYPE:
    """Register the zone commands and return the config entry's teardown."""
    # Registration is a keyed assignment, so a second setup in the same run
    # (a reload) replaces the handlers rather than stacking them.
    websocket_api.async_register_command(hass, ws_get_zones)
    websocket_api.async_register_command(hass, ws_subscribe_zones)
    hass.data.setdefault(DOMAIN, {}).setdefault(DATA_SUBSCRIPTIONS, set())

    @callback
    def _close_subscriptions() -> None:
        for teardown in list(_subscriptions(hass)):
            teardown()
        hass.data.get(DOMAIN, {}).pop(DATA_SUBSCRIPTIONS, None)

    return _close_subscriptions


def _subscriptions(hass: HomeAssistant) -> set[CALLBACK_TYPE]:
    return hass.data.setdefault(DOMAIN, {}).setdefault(DATA_SUBSCRIPTIONS, set())


def _payload(hass: HomeAssistant, device_id: str) -> dict[str, Any]:
    """Build one device's configuration as the card sees it."""
    from . import get_store  # noqa: PLC0415 - avoid a module import cycle

    # Read through `devices` rather than `store.device()`. That accessor is a
    # setdefault, so reading through it would let any websocket client mint a
    # permanent store entry for any device just by asking about it. A radar with
    # nothing stored yet is answered from an empty dict, which is the whole point
    # of this task: configuration can exist before a zone does, and asking about
    # a radar is not configuring it.
    entry = get_store(hass).devices.get(device_id) or {}
    return {
        # Zone ids are ints in the store; JSON object keys can only be strings.
        STORE_ZONES: {
            str(zone_id): zone for zone_id, zone in entry.get(STORE_ZONES, {}).items()
        },
        # null means never configured, so the card offers the suggestions below;
        # [] means the user cleared the list and wants nothing tracked. Sending
        # [] for both would re-offer auto-detection to the one user who switched
        # it off, and re-enable it the moment they saved anything else.
        STORE_ENTITIES: entry.get(STORE_ENTITIES),
        ATTR_ROTATION_DEG: entry.get(ATTR_ROTATION_DEG),
        STORE_LABEL: entry.get(STORE_LABEL),
        # Raw detection, not `effective_target_pairs`: this field is what the
        # radar offers, which stays meaningful next to whatever the user picked.
        KEY_SUGGESTED_ENTITIES: resolve_target_pairs(hass, device_id),
    }


def _answerable(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> bool:
    """Report whether a request can be served, sending the error if it cannot."""
    from . import _device_is_registered  # noqa: PLC0415 - avoid a module import cycle

    if DATA_STORE not in hass.data.get(DOMAIN, {}):
        # The commands outlive the config entry, so a dashboard left open keeps
        # calling them after an unload or during a reload.
        connection.send_error(msg["id"], ERR_NOT_LOADED, "Apollo mmWave is not loaded.")
        return False
    device_id = msg["device_id"]
    if not _device_is_registered(hass, device_id):
        # An empty payload would read as "this radar has no zones", which is the
        # same thing the card used to see when an entity went unavailable, and
        # what it did next was save that emptiness. A stale or mistyped id has to
        # be an error, not a blank canvas.
        connection.send_error(
            msg["id"],
            websocket_api.ERR_NOT_FOUND,
            f"No Home Assistant device with id {device_id}",
        )
        return False
    return True


@websocket_api.websocket_command(
    {vol.Required("type"): TYPE_GET, vol.Required("device_id"): str}
)
@callback
def ws_get_zones(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return one radar's zone configuration."""
    if not _answerable(hass, connection, msg):
        return
    connection.send_result(msg["id"], _payload(hass, msg["device_id"]))


@websocket_api.websocket_command(
    {vol.Required("type"): TYPE_SUBSCRIBE, vol.Required("device_id"): str}
)
@callback
def ws_subscribe_zones(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Push a radar's zone configuration on every change."""
    if not _answerable(hass, connection, msg):
        return
    device_id = msg["device_id"]
    active = _subscriptions(hass)
    closed = False

    @callback
    def _forward(changed_device_id: str) -> None:
        if changed_device_id == device_id:
            connection.send_event(msg["id"], _payload(hass, device_id))

    unsub_dispatcher = async_dispatcher_connect(hass, SIGNAL_ZONES_UPDATED, _forward)

    @callback
    def _teardown() -> None:
        # Three things can end this subscription: the client unsubscribing, the
        # connection closing, and the config entry unloading. Any of them can
        # come first and the other two still fire, so this has to be a no-op the
        # second time. It deliberately leaves `connection.subscriptions` alone:
        # the connection iterates that dict while closing it down.
        nonlocal closed
        if closed:
            return
        closed = True
        active.discard(_teardown)
        unsub_dispatcher()

    active.add(_teardown)
    connection.subscriptions[msg["id"]] = _teardown
    connection.send_result(msg["id"])
