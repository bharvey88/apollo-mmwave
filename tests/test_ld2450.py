"""LD2450 target pair resolution from the entity registry."""

from __future__ import annotations

from typing import TYPE_CHECKING

from homeassistant.helpers.entity_registry import RegistryEntryDisabler
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.apollo_mmwave.ld2450 import (
    effective_target_pairs,
    resolve_target_pairs,
)
from custom_components.apollo_mmwave.store import ZoneStore

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


async def test_resolve_target_pairs_accepts_mtr1_firmware_naming(
    hass, entity_registry, device_registry
) -> None:
    """The MTR-1 firmware names its targets "Target-1 X", with no LD2450 prefix."""
    device = _make_radar(hass, device_registry, "MTR-1")
    for suffix in ("target_1_x", "target_1_y", "target_3_x", "target_3_y"):
        entity_registry.async_get_or_create(
            "sensor",
            "esphome",
            suffix,
            device_id=device.id,
            suggested_object_id=f"apollo_mtr_1_cbbdb4_{suffix}",
        )
    # Not a coordinate, and must not be mistaken for one.
    entity_registry.async_get_or_create(
        "binary_sensor",
        "esphome",
        "presence",
        device_id=device.id,
        suggested_object_id="apollo_mtr_1_cbbdb4_radar_target",
    )

    assert resolve_target_pairs(hass, device.id) == [
        {
            "x": "sensor.apollo_mtr_1_cbbdb4_target_1_x",
            "y": "sensor.apollo_mtr_1_cbbdb4_target_1_y",
        },
        {
            "x": "sensor.apollo_mtr_1_cbbdb4_target_3_x",
            "y": "sensor.apollo_mtr_1_cbbdb4_target_3_y",
        },
    ]


async def test_resolve_target_pairs_ignores_other_devices(
    hass, entity_registry, device_registry
) -> None:
    """A second radar in the house does not leak into the first one's pairs."""
    device = _make_radar(hass, device_registry, "Kitchen")
    other = _make_radar(hass, device_registry, "Office")
    for base, owner in (("kitchen", device), ("office", other)):
        for axis in ("x", "y"):
            entity_registry.async_get_or_create(
                "sensor",
                "esphome",
                f"{base}1{axis}",
                device_id=owner.id,
                suggested_object_id=f"{base}_ld2450_target_1_{axis}",
            )

    assert resolve_target_pairs(hass, device.id) == [
        {
            "x": "sensor.kitchen_ld2450_target_1_x",
            "y": "sensor.kitchen_ld2450_target_1_y",
        }
    ]


async def test_resolve_target_pairs_ignores_non_sensor_domains(
    hass, entity_registry, device_registry
) -> None:
    """A number entity named like a target sensor is not a coordinate source."""
    device = _make_radar(hass, device_registry, "Kitchen")
    for axis in ("x", "y"):
        entity_registry.async_get_or_create(
            "number",
            "esphome",
            f"k2{axis}",
            device_id=device.id,
            suggested_object_id=f"kitchen_ld2450_target_2_{axis}",
        )

    assert resolve_target_pairs(hass, device.id) == []


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


async def test_effective_target_pairs_does_not_create_a_store_entry(
    hass, entity_registry, device_registry
) -> None:
    """Asking about an unstored device answers from the radar and writes nothing."""
    device = _make_radar(hass, device_registry, "Garage")
    for axis in ("x", "y"):
        entity_registry.async_get_or_create(
            "sensor",
            "esphome",
            f"g1{axis}",
            device_id=device.id,
            suggested_object_id=f"garage_ld2450_target_1_{axis}",
        )
    store = ZoneStore(hass)

    pairs = effective_target_pairs(hass, store, device.id)

    assert pairs == [
        {
            "x": "sensor.garage_ld2450_target_1_x",
            "y": "sensor.garage_ld2450_target_1_y",
        }
    ]
    # A setdefault read here would leave a permanent entry for a device nobody
    # has configured, which is the phantom-entry bug this release exists to fix.
    assert store.devices == {}
