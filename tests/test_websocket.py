"""Websocket API the zone card reads its configuration through."""

from __future__ import annotations

from homeassistant.helpers.dispatcher import DATA_DISPATCHER

from custom_components.apollo_mmwave import get_store
from custom_components.apollo_mmwave.const import (
    DOMAIN,
    SIGNAL_ZONES_UPDATED,
    STORE_ZONES,
)

from .conftest import RADAR_TARGET_COUNT

GET = "apollo_mmwave/zones/get"
SUBSCRIBE = "apollo_mmwave/zones/subscribe"

RECT_CALL = {
    "zone_id": 1,
    "shape": "rect",
    "data": {"x_min": 0, "x_max": 10, "y_min": 0, "y_max": 10},
}


def _forwarder_count(hass) -> int:
    """Count the dispatcher targets live zone subscriptions own."""
    # Both entity platforms listen on the same signal, so counting the whole
    # target list would not show a leaked subscription. Only this module's
    # closures are counted.
    targets = hass.data.get(DATA_DISPATCHER, {}).get(SIGNAL_ZONES_UPDATED, {})
    return sum(
        1
        for target in targets
        if getattr(target, "__module__", "").endswith("apollo_mmwave.websocket")
    )


async def test_zones_get_returns_stored_zones_and_suggested_pairs(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """A device with nothing drawn still reports the radar's own targets."""
    _ = init_integration
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": GET, "device_id": device_id})

    result = (await client.receive_json())["result"]
    assert result["zones"] == {}
    assert result["suggested_entities"] == [
        {
            "x": f"sensor.r_pro_ld2450_target_{target}_x",
            "y": f"sensor.r_pro_ld2450_target_{target}_y",
        }
        for target in range(1, RADAR_TARGET_COUNT + 1)
    ]


async def test_zones_get_returns_zone_ids_as_strings(
    hass, hass_ws_client, setup_entry_with_zone
) -> None:
    """Zone ids are ints in the store and have to be strings in JSON."""
    device_id, _ = setup_entry_with_zone
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": GET, "device_id": device_id})

    zones = (await client.receive_json())["result"]["zones"]
    assert list(zones) == ["1"]
    assert zones["1"]["shape"] == "rect"


async def test_zones_get_reports_never_configured_entities_as_null(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Never configured has to stay distinguishable from deliberately empty."""
    _ = init_integration
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": GET, "device_id": device_id})

    result = (await client.receive_json())["result"]
    assert result["entities"] is None
    assert result["rotation_deg"] is None
    assert result["label"] is None


async def test_zones_get_reports_cleared_entities_as_an_empty_list(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Clearing the list means track nothing, not fall back to the radar."""
    _ = init_integration
    await hass.services.async_call(
        DOMAIN,
        "update_zone",
        {"device_id": device_id, "clear_entities": True},
        blocking=True,
    )
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": GET, "device_id": device_id})

    result = (await client.receive_json())["result"]
    assert result["entities"] == []
    # The suggestion still travels: the card offers it, the user chose against it.
    assert len(result["suggested_entities"]) == RADAR_TARGET_COUNT


async def test_zones_get_does_not_create_a_store_entry(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Reading a device's configuration must not write one."""
    _ = init_integration
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": GET, "device_id": device_id})
    assert (await client.receive_json())["success"] is True

    assert get_store(hass).devices == {}


async def test_zones_get_rejects_an_unknown_device(
    hass, hass_ws_client, init_integration
) -> None:
    """A device id Home Assistant does not know is an error, not a blank card."""
    _ = init_integration
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": GET, "device_id": "no-such-device"})

    message = await client.receive_json()
    assert message["success"] is False
    assert message["error"]["code"] == "not_found"
    assert get_store(hass).devices == {}


async def test_zones_get_reports_the_integration_unloaded(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """The commands outlive the config entry, so they answer without the store."""
    assert await hass.config_entries.async_unload(init_integration.entry_id)
    await hass.async_block_till_done()
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": GET, "device_id": device_id})

    message = await client.receive_json()
    assert message["success"] is False
    assert message["error"]["code"] == "not_loaded"


async def test_zones_subscribe_pushes_on_change(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Every zone change reaches a subscribed card."""
    _ = init_integration
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": SUBSCRIBE, "device_id": device_id})
    assert (await client.receive_json())["success"] is True

    await hass.services.async_call(
        DOMAIN, "update_zone", {"device_id": device_id, **RECT_CALL}, blocking=True
    )

    message = await client.receive_json()
    assert message["event"]["zones"]["1"]["shape"] == "rect"


async def test_zones_subscribe_ignores_other_devices(
    hass, hass_ws_client, init_integration, device_id, device_registry
) -> None:
    """A card only hears about the radar it is showing."""
    other = device_registry.async_get_or_create(
        config_entry_id=init_integration.entry_id,
        identifiers={("esphome", "some_other_radar")},
        name="Other radar",
    )
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": SUBSCRIBE, "device_id": other.id})
    assert (await client.receive_json())["success"] is True

    await hass.services.async_call(
        DOMAIN, "update_zone", {"device_id": device_id, **RECT_CALL}, blocking=True
    )

    await client.send_json_auto_id({"type": "ping"})
    assert (await client.receive_json())["type"] == "pong"


async def test_zones_subscribe_rejects_an_unknown_device(
    hass, hass_ws_client, init_integration
) -> None:
    """A rejected subscription leaves no dispatcher connection behind."""
    _ = init_integration
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": SUBSCRIBE, "device_id": "no-such-device"})

    message = await client.receive_json()
    assert message["success"] is False
    assert message["error"]["code"] == "not_found"
    assert _forwarder_count(hass) == 0
    assert get_store(hass).devices == {}


async def test_zones_subscribe_stops_on_unsubscribe(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Unsubscribing drops the dispatcher connection and the pushes with it."""
    _ = init_integration
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": SUBSCRIBE, "device_id": device_id})
    subscription = (await client.receive_json())["id"]
    assert _forwarder_count(hass) == 1

    await client.send_json_auto_id(
        {"type": "unsubscribe_events", "subscription": subscription}
    )
    assert (await client.receive_json())["success"] is True
    assert _forwarder_count(hass) == 0

    await hass.services.async_call(
        DOMAIN, "update_zone", {"device_id": device_id, **RECT_CALL}, blocking=True
    )

    # A pong arriving next proves no event was queued ahead of it.
    await client.send_json_auto_id({"type": "ping"})
    assert (await client.receive_json())["type"] == "pong"


async def test_zones_subscribe_is_torn_down_when_the_entry_unloads(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Unloading the entry drops live subscriptions, and unsubscribing after is safe."""
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": SUBSCRIBE, "device_id": device_id})
    subscription = (await client.receive_json())["id"]
    assert _forwarder_count(hass) == 1

    assert await hass.config_entries.async_unload(init_integration.entry_id)
    await hass.async_block_till_done()
    assert _forwarder_count(hass) == 0

    # The client has no way to know the entry went away, so its unsubscribe still
    # arrives and must not tear the same connection down twice.
    await client.send_json_auto_id(
        {"type": "unsubscribe_events", "subscription": subscription}
    )
    assert (await client.receive_json())["success"] is True


async def test_zone_commands_survive_a_reload(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Registration runs again on every setup, so it has to be idempotent."""
    await hass.config_entries.async_reload(init_integration.entry_id)
    await hass.async_block_till_done()
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": SUBSCRIBE, "device_id": device_id})
    assert (await client.receive_json())["success"] is True

    await hass.services.async_call(
        DOMAIN, "update_zone", {"device_id": device_id, **RECT_CALL}, blocking=True
    )

    message = await client.receive_json()
    assert message["event"]["zones"]["1"]["shape"] == "rect"
    assert get_store(hass).device(device_id)[STORE_ZONES][1]["shape"] == "rect"
