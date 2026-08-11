"""Zone store: device-id keying and the v1 (display name) migration."""

from __future__ import annotations

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.apollo_mmwave.store import ZoneStore


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
    hass, hass_storage
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
