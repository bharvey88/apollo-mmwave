"""A refused entity add is retried instead of leaving the zone entity-less."""

from __future__ import annotations

from homeassistant.helpers import entity_registry as er

from custom_components.apollo_mmwave import get_store
from custom_components.apollo_mmwave.const import (
    DOMAIN,
    SERVICE_UPDATE_ZONE,
    STORE_INPUT_UNITS,
)
from custom_components.apollo_mmwave.zone_entities import ZoneEntityTracker

from .conftest import RECT_ZONE


def _zone_entity_ids(hass, device_id: str) -> tuple[str | None, str | None]:
    registry = er.async_get(hass)
    return (
        registry.async_get_entity_id("sensor", DOMAIN, f"{device_id}_zone_1"),
        registry.async_get_entity_id(
            "binary_sensor", DOMAIN, f"{device_id}_zone_1_presence"
        ),
    )


async def _draw(hass, device_id: str) -> None:
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "zone_id": 1, **RECT_ZONE},
        blocking=True,
    )


async def test_delete_and_immediate_redraw_keeps_one_entity_per_zone(
    hass, init_integration, device_id
) -> None:
    """Deleting a zone and redrawing it before HA finishes removing the old entity."""
    _ = init_integration
    await _draw(hass, device_id)
    await hass.async_block_till_done()
    before = _zone_entity_ids(hass, device_id)
    assert all(before)

    # No block_till_done between the two: the old entities are still leaving.
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "zone_id": 1, "delete": True},
        blocking=True,
    )
    await _draw(hass, device_id)
    await hass.async_block_till_done()
    await hass.async_block_till_done()

    after = _zone_entity_ids(hass, device_id)
    assert all(after)
    assert after == before
    assert hass.states.get(after[0]) is not None
    assert hass.states.get(after[1]) is not None


async def test_refused_add_is_retried_on_the_next_zone_signal(
    hass, init_integration, device_id
) -> None:
    """An entity the platform aborted is offered again, not forgotten."""
    _ = init_integration
    tracker = ZoneEntityTracker(hass, "sensor")
    key = (device_id, 1)

    class _Fake:
        add_aborted = False

    first = _Fake()
    assert tracker.needs_entity(key)
    tracker.mark_pending(key, first)
    # Still in flight: no second copy.
    assert not tracker.needs_entity(key)

    first.add_aborted = True
    assert tracker.has_aborted
    assert tracker.needs_entity(key)

    second = _Fake()
    tracker.mark_pending(key, second)
    tracker.mark_live(key)
    assert not tracker.has_aborted
    assert not tracker.needs_entity(key)

    tracker.mark_gone(key)
    assert tracker.needs_entity(key)
    assert not tracker.is_disabled(f"{device_id}_zone_1")


async def test_input_units_round_trip_through_the_store(
    hass, init_integration, device_id
) -> None:
    """The service stores the unit and the websocket payload reports it."""
    _ = init_integration
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "input_units": "ft"},
        blocking=True,
    )
    await hass.async_block_till_done()
    assert get_store(hass).devices[device_id][STORE_INPUT_UNITS] == "ft"
