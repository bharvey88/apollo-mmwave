"""LD2450 target pair resolution from the entity registry."""

from __future__ import annotations

from typing import TYPE_CHECKING

from homeassistant.helpers.entity_registry import RegistryEntryDisabler
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.apollo_mmwave.ld2450 import resolve_target_pairs

if TYPE_CHECKING:
    from homeassistant.helpers.device_registry import DeviceEntry


def _make_radar(hass, device_registry, name: str) -> DeviceEntry:
    """Register an esphome radar device. Its entry has to be real."""
    # The device registry refuses to link a device to a config entry that does
    # not exist, so the radar's owning entry has to be real.
    esphome_entry = MockConfigEntry(domain="esphome", title=name)
    esphome_entry.add_to_hass(hass)
    return device_registry.async_get_or_create(
        config_entry_id=esphome_entry.entry_id,
        identifiers={("esphome", name)},
        name=name,
    )


async def test_resolve_target_pairs_pairs_x_and_y_by_target_number(
    hass, entity_registry, device_registry
) -> None:
    """Each X sensor pairs with the Y carrying the same target number."""
    device = _make_radar(hass, device_registry, "R Pro")
    for suffix in ("target_1_x", "target_1_y", "target_2_x", "target_2_y"):
        entity_registry.async_get_or_create(
            "sensor",
            "esphome",
            suffix,
            device_id=device.id,
            suggested_object_id=f"r_pro_ld2450_{suffix}",
        )

    pairs = resolve_target_pairs(hass, device.id)

    assert pairs == [
        {"x": "sensor.r_pro_ld2450_target_1_x", "y": "sensor.r_pro_ld2450_target_1_y"},
        {"x": "sensor.r_pro_ld2450_target_2_x", "y": "sensor.r_pro_ld2450_target_2_y"},
    ]


async def test_resolve_target_pairs_skips_unpaired_and_tolerates_dedup_suffix(
    hass, entity_registry, device_registry
) -> None:
    """A `_2` dedup suffix still matches, and a lone X is not returned."""
    device = _make_radar(hass, device_registry, "MTR")
    for suffix, object_id in (
        ("t1x", "mtr_ld2450_target_1_x_2"),
        ("t1y", "mtr_ld2450_target_1_y_2"),
        ("t2x", "mtr_ld2450_target_2_x"),
    ):
        entity_registry.async_get_or_create(
            "sensor",
            "esphome",
            suffix,
            device_id=device.id,
            suggested_object_id=object_id,
        )

    assert resolve_target_pairs(hass, device.id) == [
        {"x": "sensor.mtr_ld2450_target_1_x_2", "y": "sensor.mtr_ld2450_target_1_y_2"}
    ]


async def test_resolve_target_pairs_ignores_other_devices_and_domains(
    hass, entity_registry, device_registry
) -> None:
    """Only sensors on the asked-for device count."""
    device = _make_radar(hass, device_registry, "Kitchen")
    other = _make_radar(hass, device_registry, "Office")
    entity_registry.async_get_or_create(
        "sensor",
        "esphome",
        "k1x",
        device_id=device.id,
        suggested_object_id="kitchen_ld2450_target_1_x",
    )
    entity_registry.async_get_or_create(
        "sensor",
        "esphome",
        "k1y",
        device_id=device.id,
        suggested_object_id="kitchen_ld2450_target_1_y",
    )
    # A number entity named like a target sensor must not be paired: the card
    # reads states from the sensor domain only.
    entity_registry.async_get_or_create(
        "number",
        "esphome",
        "k2x",
        device_id=device.id,
        suggested_object_id="kitchen_ld2450_target_2_x",
    )
    entity_registry.async_get_or_create(
        "number",
        "esphome",
        "k2y",
        device_id=device.id,
        suggested_object_id="kitchen_ld2450_target_2_y",
    )
    entity_registry.async_get_or_create(
        "sensor",
        "esphome",
        "o1x",
        device_id=other.id,
        suggested_object_id="office_ld2450_target_1_x",
    )
    entity_registry.async_get_or_create(
        "sensor",
        "esphome",
        "o1y",
        device_id=other.id,
        suggested_object_id="office_ld2450_target_1_y",
    )

    assert resolve_target_pairs(hass, device.id) == [
        {
            "x": "sensor.kitchen_ld2450_target_1_x",
            "y": "sensor.kitchen_ld2450_target_1_y",
        }
    ]


async def test_resolve_target_pairs_skips_disabled_entities(
    hass, entity_registry, device_registry
) -> None:
    """A disabled Y has no state to read, so its target is not offered."""
    device = _make_radar(hass, device_registry, "Den")
    entity_registry.async_get_or_create(
        "sensor",
        "esphome",
        "d1x",
        device_id=device.id,
        suggested_object_id="den_ld2450_target_1_x",
    )
    entity_registry.async_get_or_create(
        "sensor",
        "esphome",
        "d1y",
        device_id=device.id,
        suggested_object_id="den_ld2450_target_1_y",
        disabled_by=RegistryEntryDisabler.USER,
    )

    assert resolve_target_pairs(hass, device.id) == []


async def test_resolve_target_pairs_is_empty_for_a_device_without_a_radar(
    hass, device_registry
) -> None:
    """A device with no LD2450 entities resolves to nothing, not an error."""
    device = _make_radar(hass, device_registry, "Plug")

    assert resolve_target_pairs(hass, device.id) == []


async def test_resolve_target_pairs_sorts_numerically_not_lexically(
    hass, entity_registry, device_registry
) -> None:
    """Target 10 sorts after target 2, which string ordering would get wrong."""
    device = _make_radar(hass, device_registry, "Hall")
    for n in (10, 2):
        for axis in ("x", "y"):
            entity_registry.async_get_or_create(
                "sensor",
                "esphome",
                f"h{n}{axis}",
                device_id=device.id,
                suggested_object_id=f"hall_ld2450_target_{n}_{axis}",
            )

    assert [pair["x"] for pair in resolve_target_pairs(hass, device.id)] == [
        "sensor.hall_ld2450_target_2_x",
        "sensor.hall_ld2450_target_10_x",
    ]
