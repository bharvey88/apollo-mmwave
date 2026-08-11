"""Zone geometry sensors: identity, device attachment, and attributes."""

from __future__ import annotations

from homeassistant.helpers.dispatcher import async_dispatcher_send

from custom_components.apollo_mmwave import get_store
from custom_components.apollo_mmwave.const import (
    ATTR_ROTATION_DEG,
    DOMAIN,
    SIGNAL_ZONES_UPDATED,
    STORE_ENTITIES,
    STORE_ZONES,
)

from .conftest import RECT_ZONE


async def test_zone_entities_attach_to_the_source_device(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """Zone entities land on the radar's device page, not floating alone."""
    device_id, _ = setup_entry_with_zone

    sensor_id = entity_registry.async_get_entity_id(
        "sensor", DOMAIN, f"{device_id}_zone_1"
    )
    presence_id = entity_registry.async_get_entity_id(
        "binary_sensor", DOMAIN, f"{device_id}_zone_1_presence"
    )

    assert sensor_id is not None
    assert presence_id is not None
    assert entity_registry.async_get(sensor_id).device_id == device_id
    assert entity_registry.async_get(presence_id).device_id == device_id


async def test_renaming_a_zone_entity_does_not_break_it(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """Entity ids are not part of any contract now, so renames are safe."""
    device_id, _ = setup_entry_with_zone
    old = entity_registry.async_get_entity_id("sensor", DOMAIN, f"{device_id}_zone_1")

    entity_registry.async_update_entity(old, new_entity_id="sensor.my_own_name")
    await hass.async_block_till_done()

    assert hass.states.get("sensor.my_own_name") is not None

    # Surviving the rename is not enough: the renamed entity has to still be
    # wired to zone updates, which is where a re-add without re-subscription
    # would show up.
    get_store(hass).device(device_id)[STORE_ZONES][1] = {
        "shape": "ellipse",
        "data": {"cx": 0, "cy": 0, "rx": 100, "ry": 100},
    }
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()

    assert hass.states.get("sensor.my_own_name").attributes["shape"] == "ellipse"


async def test_zone_sensor_id_and_name_come_from_the_device(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """The generated entity id is device-derived, and nothing pins it."""
    # The object id is calculated once, at registration, from the linked device.
    # Asserting it literally is what catches a re-pinned entity_id or a lost
    # device link, neither of which the unique-id lookups elsewhere would see.
    device_id, _ = setup_entry_with_zone
    sensor_id = entity_registry.async_get_entity_id(
        "sensor", DOMAIN, f"{device_id}_zone_1"
    )

    assert sensor_id == "sensor.apollo_r_pro_1_abc123_zone_1"
    assert (
        entity_registry.async_get_entity_id(
            "binary_sensor", DOMAIN, f"{device_id}_zone_1_presence"
        )
        == "binary_sensor.apollo_r_pro_1_abc123_zone_1_presence"
    )
    state = hass.states.get(sensor_id)
    assert state.attributes["friendly_name"] == "Apollo R_PRO-1 abc123 Zone 1"


async def test_zone_sensor_exposes_geometry(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """The card reads shape, data, tracked entities, and rotation from here."""
    device_id, _ = setup_entry_with_zone
    device = get_store(hass).device(device_id)
    device[STORE_ENTITIES] = [{"x": "sensor.a", "y": "sensor.b"}]
    device[ATTR_ROTATION_DEG] = 90
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()

    sensor_id = entity_registry.async_get_entity_id(
        "sensor", DOMAIN, f"{device_id}_zone_1"
    )
    state = hass.states.get(sensor_id)

    assert state.state == "1"
    assert state.attributes["shape"] == "rect"
    assert state.attributes["data"] == RECT_ZONE["data"]
    assert state.attributes["entities"] == [{"x": "sensor.a", "y": "sensor.b"}]
    assert state.attributes[ATTR_ROTATION_DEG] == 90


async def test_zone_added_later_gets_a_sensor(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """A zone drawn after setup creates its entity off the update signal."""
    device_id, _ = setup_entry_with_zone
    get_store(hass).device(device_id)[STORE_ZONES][2] = dict(RECT_ZONE)
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()

    assert (
        entity_registry.async_get_entity_id("sensor", DOMAIN, f"{device_id}_zone_2")
        is not None
    )


async def test_zone_on_a_missing_device_is_logged(
    hass, init_integration, caplog
) -> None:
    """A zone whose device is gone degrades quietly, so say so in the log."""
    _ = init_integration
    get_store(hass).device("gone_forever")[STORE_ZONES][1] = dict(RECT_ZONE)
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, "gone_forever")
    await hass.async_block_till_done()

    assert "gone_forever" in caplog.text


async def test_zones_on_two_devices_do_not_collide(
    hass, entity_registry, device_registry, init_integration, device_id
) -> None:
    """Two radars with a zone 1 each get distinct entities, not a dedup suffix."""
    from pytest_homeassistant_custom_component.common import (  # noqa: PLC0415
        MockConfigEntry,
    )

    other_entry = MockConfigEntry(domain="esphome", title="Apollo MTR-1 def456")
    other_entry.add_to_hass(hass)
    other = device_registry.async_get_or_create(
        config_entry_id=other_entry.entry_id,
        identifiers={("esphome", "apollo_mtr_1_def456")},
        name="Apollo MTR-1 def456",
    )
    store = get_store(hass)
    for target in (device_id, other.id):
        store.device(target)[STORE_ZONES][1] = dict(RECT_ZONE)
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()

    # Both are "Zone 1", so without the device link the second would land on
    # sensor.zone_1_2. The ids have to be device-derived, not deduplicated.
    assert (
        entity_registry.async_get_entity_id("sensor", DOMAIN, f"{device_id}_zone_1")
        == "sensor.apollo_r_pro_1_abc123_zone_1"
    )
    assert (
        entity_registry.async_get_entity_id("sensor", DOMAIN, f"{other.id}_zone_1")
        == "sensor.apollo_mtr_1_def456_zone_1"
    )
