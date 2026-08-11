"""Zone store: device-id keying and the v1 (display name) migration."""

from __future__ import annotations

from typing import TYPE_CHECKING

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.apollo_mmwave.store import ZoneStore

if TYPE_CHECKING:
    from homeassistant.helpers.device_registry import DeviceEntry

TARGET_X = "sensor.apollo_r_pro_1_abc123_ld2450_target_1_x"
TARGET_Y = "sensor.apollo_r_pro_1_abc123_ld2450_target_1_y"


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


async def test_load_v1_migrates_location_keys_to_device_ids(
    hass, hass_storage, device_registry, entity_registry
) -> None:
    """A v1 store keyed by display name is rekeyed to the device id."""
    # The device registry refuses to link a device to a config entry that does
    # not exist, so the radar's owning entry has to be real.
    esphome_entry = MockConfigEntry(domain="esphome", title="R_PRO-1")
    esphome_entry.add_to_hass(hass)
    device = device_registry.async_get_or_create(
        config_entry_id=esphome_entry.entry_id,
        identifiers={("esphome", "r-pro-1-abc")},
        name="Apollo R_PRO-1 abc123",
    )
    entity_registry.async_get_or_create(
        "sensor",
        "esphome",
        "x1",
        device_id=device.id,
        suggested_object_id="apollo_r_pro_1_abc123_ld2450_target_1_x",
    )
    hass_storage["apollo_mmwave.zones"] = {
        "version": 1,
        "data": {
            "locations": {
                "Apollo R_PRO-1 abc123": {
                    "zones": {
                        "1": {
                            "shape": "rect",
                            "data": {
                                "x_min": 0,
                                "x_max": 10,
                                "y_min": 0,
                                "y_max": 10,
                            },
                        }
                    },
                    "entities": [
                        {
                            "x": "sensor.apollo_r_pro_1_abc123_ld2450_target_1_x",
                            "y": "sensor.apollo_r_pro_1_abc123_ld2450_target_1_y",
                        }
                    ],
                    "rotation_deg": 15,
                }
            }
        },
    }

    store = ZoneStore(hass)
    assert await store.async_load() is True

    assert list(store.devices) == [device.id]
    entry = store.devices[device.id]
    assert entry["zones"][1]["shape"] == "rect"
    assert entry["rotation_deg"] == 15
    assert entry["label"] == "Apollo R_PRO-1 abc123"


async def test_load_v1_unresolvable_location_is_kept_as_orphan(
    hass, hass_storage, caplog
) -> None:
    """A location matching no device is preserved, not silently dropped."""
    hass_storage["apollo_mmwave.zones"] = {
        "version": 1,
        "data": {
            "locations": {
                "Ghost Room": {
                    "zones": {"2": {"shape": "none", "data": None}},
                    "entities": [],
                }
            }
        },
    }

    store = ZoneStore(hass)
    assert await store.async_load() is True

    assert store.devices == {}
    assert store.orphans["Ghost Room"]["zones"][2]["shape"] == "none"
    assert "Ghost Room" in caplog.text
    assert any(
        record.levelname == "WARNING" and "Ghost Room" in record.message
        for record in caplog.records
    )


async def test_v1_resolves_by_tracked_entity_when_name_does_not_match(
    hass, hass_storage, device_registry, entity_registry
) -> None:
    """The tracked entity pair alone is enough: the location key is ignored."""
    device = _make_radar(hass, device_registry, "Apollo R_PRO-1 abc123")
    entity_registry.async_get_or_create(
        "sensor",
        "esphome",
        "x1",
        device_id=device.id,
        suggested_object_id="apollo_r_pro_1_abc123_ld2450_target_1_x",
    )
    hass_storage["apollo_mmwave.zones"] = {
        "version": 1,
        "data": {
            "locations": {
                # Nothing about "Old Name" slugifies to the device's name, so
                # only the entity-registry branch can resolve this.
                "Old Name": {
                    "zones": {"1": {"shape": "rect", "data": {}}},
                    "entities": [{"x": TARGET_X, "y": TARGET_Y}],
                }
            }
        },
    }

    store = ZoneStore(hass)
    assert await store.async_load() is True

    assert list(store.devices) == [device.id]
    assert store.devices[device.id]["label"] == "Old Name"
    assert store.orphans == {}


async def test_v1_resolves_by_device_name_when_no_entities(
    hass, hass_storage, device_registry
) -> None:
    """With no entities to follow, the slugified device name resolves it."""
    device = _make_radar(hass, device_registry, "Apollo R_PRO-1 abc123")
    hass_storage["apollo_mmwave.zones"] = {
        "version": 1,
        "data": {
            "locations": {
                "apollo r_pro-1 abc123": {
                    "zones": {"1": {"shape": "rect", "data": {}}},
                    "entities": [],
                }
            }
        },
    }

    store = ZoneStore(hass)
    assert await store.async_load() is True

    assert list(store.devices) == [device.id]
    assert store.devices[device.id]["zones"][1]["shape"] == "rect"


async def test_v1_locations_colliding_on_one_device_are_merged(
    hass, hass_storage, device_registry, entity_registry, caplog
) -> None:
    """A mid-life rename leaves two locations on one device; keep both zones."""
    device = _make_radar(hass, device_registry, "Apollo R_PRO-1 abc123")
    entity_registry.async_get_or_create(
        "sensor",
        "esphome",
        "x1",
        device_id=device.id,
        suggested_object_id="apollo_r_pro_1_abc123_ld2450_target_1_x",
    )
    hass_storage["apollo_mmwave.zones"] = {
        "version": 1,
        "data": {
            "locations": {
                "Kitchen": {
                    "zones": {
                        "1": {"shape": "rect", "data": {}},
                        "2": {"shape": "rect", "data": {}},
                    },
                    "entities": [{"x": TARGET_X, "y": TARGET_Y}],
                    "rotation_deg": 15,
                },
                "Apollo R_PRO-1 abc123": {
                    "zones": {
                        "2": {"shape": "ellipse", "data": {}},
                        "3": {"shape": "polygon", "data": {}},
                    },
                    "entities": [],
                    "rotation_deg": 90,
                },
            }
        },
    }

    store = ZoneStore(hass)
    assert await store.async_load() is True

    entry = store.devices[device.id]
    assert sorted(entry["zones"]) == [1, 2, 3]
    # First writer wins on a conflicting zone id, and on the scalars.
    assert entry["zones"][2]["shape"] == "rect"
    assert entry["zones"][3]["shape"] == "polygon"
    assert entry["entities"] == [{"x": TARGET_X, "y": TARGET_Y}]
    assert entry["rotation_deg"] == 15
    assert entry["label"] == "Kitchen"

    conflict = [
        record.message
        for record in caplog.records
        if record.levelname == "WARNING" and "Kitchen" in record.message
    ]
    assert conflict, "expected a warning about the conflicting zone id"
    assert "Apollo R_PRO-1 abc123" in conflict[0]
    assert "2" in conflict[0]
