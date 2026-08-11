"""Zone presence sensors: device attachment, tracked pairs, and the fallback."""

from __future__ import annotations

from homeassistant.helpers.dispatcher import async_dispatcher_send
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.apollo_mmwave import get_store, ld2450
from custom_components.apollo_mmwave.const import (
    ATTR_ROTATION_DEG,
    DOMAIN,
    SIGNAL_ZONES_UPDATED,
    STORE_ENTITIES,
    STORE_ZONES,
)

from .conftest import RECT_ZONE

TARGET_1 = {
    "x": "sensor.r_pro_ld2450_target_1_x",
    "y": "sensor.r_pro_ld2450_target_1_y",
}
TARGET_2 = {
    "x": "sensor.r_pro_ld2450_target_2_x",
    "y": "sensor.r_pro_ld2450_target_2_y",
}


def _presence_id(entity_registry, device_id: str) -> str:
    return entity_registry.async_get_entity_id(
        "binary_sensor", DOMAIN, f"{device_id}_zone_1_presence"
    )


def _set_target(hass, pair: dict[str, str], x: float, y: float) -> None:
    hass.states.async_set(pair["x"], str(x))
    hass.states.async_set(pair["y"], str(y))


async def test_presence_falls_back_to_the_devices_ld2450_targets(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """An unconfigured device still detects, using its own target sensors."""
    device_id, _ = setup_entry_with_zone
    assert get_store(hass).device(device_id).get(STORE_ENTITIES) is None
    presence_id = _presence_id(entity_registry, device_id)

    _set_target(hass, TARGET_1, 0, 1000)
    await hass.async_block_till_done()

    assert hass.states.get(presence_id).state == "on"


async def test_configured_pairs_win_over_the_fallback(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """An explicit pair list is a deliberate narrowing, so honour it exactly."""
    device_id, _ = setup_entry_with_zone
    get_store(hass).device(device_id)[STORE_ENTITIES] = [TARGET_2]
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()
    presence_id = _presence_id(entity_registry, device_id)

    _set_target(hass, TARGET_1, 0, 1000)  # inside, but not tracked
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    _set_target(hass, TARGET_2, 0, 1000)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"


async def test_an_explicitly_cleared_list_tracks_nothing(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """Clearing the pair list has to mean none, not every target on the radar."""
    device_id, _ = setup_entry_with_zone
    get_store(hass).device(device_id)[STORE_ENTITIES] = []
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()

    _set_target(hass, TARGET_1, 0, 1000)
    _set_target(hass, TARGET_2, 0, 1000)
    await hass.async_block_till_done()

    assert hass.states.get(_presence_id(entity_registry, device_id)).state == "off"


async def test_presence_tracks_targets_in_and_out(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """Presence flips as the tracked target moves in and out of the zone."""
    device_id, _ = setup_entry_with_zone
    presence_id = _presence_id(entity_registry, device_id)

    _set_target(hass, TARGET_1, 0, 1000)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    _set_target(hass, TARGET_1, 5000, 1000)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    # (0, 0) readings mean "no target" and must not count as inside.
    _set_target(hass, TARGET_1, 0, 0)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"


async def test_presence_applies_the_devices_rotation(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """A 90 degree device rotation maps (x, y) to (y, -x) before the zone test."""
    device_id, _ = setup_entry_with_zone
    get_store(hass).device(device_id)[ATTR_ROTATION_DEG] = 90
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()
    presence_id = _presence_id(entity_registry, device_id)

    # (1000, 0) rotates to (0, -1000): outside, since y_min is 0.
    _set_target(hass, TARGET_1, 1000, 0)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    # (-1000, 0) rotates to (0, 1000): inside.
    _set_target(hass, TARGET_1, -1000, 0)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"


async def test_presence_entity_attaches_to_the_device(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """Automations are built from the device page, so it has to appear there."""
    device_id, _ = setup_entry_with_zone

    entry = entity_registry.async_get(_presence_id(entity_registry, device_id))
    assert entry.device_id == device_id
    assert entry.original_name == "Zone 1 presence"


async def test_fallback_recovers_when_target_sensors_appear_later(
    hass, entity_registry, device_registry, init_integration, device_id
) -> None:
    """A radar whose entities land after ours must not sit off forever."""
    _ = (init_integration, device_id)
    esphome_entry = MockConfigEntry(domain="esphome", title="Apollo MTR-1 late")
    esphome_entry.add_to_hass(hass)
    late = device_registry.async_get_or_create(
        config_entry_id=esphome_entry.entry_id,
        identifiers={("esphome", "apollo_mtr_1_late")},
        name="Apollo MTR-1 late",
    )
    get_store(hass).device(late.id)[STORE_ZONES][1] = dict(RECT_ZONE)
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, late.id)
    await hass.async_block_till_done()
    presence_id = _presence_id(entity_registry, late.id)
    assert hass.states.get(presence_id).state == "off"

    for axis in ("x", "y"):
        entity_registry.async_get_or_create(
            "sensor",
            "esphome",
            f"late1{axis}",
            device_id=late.id,
            suggested_object_id=f"late_ld2450_target_1_{axis}",
        )
    await hass.async_block_till_done()

    hass.states.async_set("sensor.late_ld2450_target_1_x", "0")
    hass.states.async_set("sensor.late_ld2450_target_1_y", "1000")
    await hass.async_block_till_done()

    assert hass.states.get(presence_id).state == "on"


async def test_fallback_is_not_re_resolved_on_every_coordinate_update(
    hass, entity_registry, setup_entry_with_zone, monkeypatch
) -> None:
    """Resolving scans the device's whole entity list; targets update constantly."""
    device_id, _ = setup_entry_with_zone
    resolved: list[str] = []
    real = ld2450.resolve_target_pairs

    def _counting(hass_, target_device_id: str) -> list[dict[str, str]]:
        resolved.append(target_device_id)
        return real(hass_, target_device_id)

    monkeypatch.setattr(ld2450, "resolve_target_pairs", _counting)

    for offset in range(5):
        _set_target(hass, TARGET_1, 0, 1000 + offset)
        await hass.async_block_till_done()

    assert hass.states.get(_presence_id(entity_registry, device_id)).state == "on"
    assert resolved == []
