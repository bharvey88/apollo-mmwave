"""
Presence binary sensor platform for Apollo mmWave.

One occupancy sensor per zone: on when any tracked LD2450 target's (x, y) —
rotated by the location's device rotation — falls inside the zone's shape.
"""

from __future__ import annotations

import logging
import math
from typing import TYPE_CHECKING, Any

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.util import slugify

from .const import (
    ATTR_CX,
    ATTR_CY,
    ATTR_DATA,
    ATTR_POINTS,
    ATTR_ROTATION_DEG,
    ATTR_RX,
    ATTR_RY,
    ATTR_SHAPE,
    ATTR_X_MAX,
    ATTR_X_MIN,
    ATTR_Y_MAX,
    ATTR_Y_MIN,
    POLYGON_MIN_POINTS,
    PRESENCE_SENSOR_UNIQUE_ID_FMT,
    SIGNAL_ZONES_UPDATED,
    STORE_ENTITIES,
    STORE_ZONES,
)

if TYPE_CHECKING:
    from collections.abc import Callable, Iterator

    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import Event, EventStateChangedData, HomeAssistant, State
    from homeassistant.helpers.entity_platform import AddEntitiesCallback

    from .store import ZoneStore

_LOGGER = logging.getLogger(__name__)

_LINE_INTERSECTION_EPSILON = 1e-12

type ShapeData = Any
type ShapeTester = Callable[[float, float, ShapeData], bool]


def _coerce_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _build_point_rotator(
    rotation_raw: Any,
) -> Callable[[float, float], tuple[float, float]]:
    rotation_val = _coerce_float(rotation_raw)
    if rotation_val is None:
        cos_theta = 1.0
        sin_theta = 0.0
    else:
        rotation_rad = math.radians(rotation_val)
        cos_theta = math.cos(rotation_rad)
        sin_theta = math.sin(rotation_rad)

    def rotate(x_val: float, y_val: float) -> tuple[float, float]:
        return (
            x_val * cos_theta + y_val * sin_theta,
            -x_val * sin_theta + y_val * cos_theta,
        )

    return rotate


def _point_in_rect(x_val: float, y_val: float, rect: ShapeData) -> bool:
    if not isinstance(rect, dict):
        return False
    x_min = _coerce_float(rect.get(ATTR_X_MIN))
    x_max = _coerce_float(rect.get(ATTR_X_MAX))
    y_min = _coerce_float(rect.get(ATTR_Y_MIN))
    y_max = _coerce_float(rect.get(ATTR_Y_MAX))
    if x_min is None or x_max is None or y_min is None or y_max is None:
        return False
    if not (x_min < x_max and y_min < y_max):
        return False
    return x_min <= x_val <= x_max and y_min <= y_val <= y_max


def _point_in_ellipse(x_val: float, y_val: float, ellipse: ShapeData) -> bool:
    if not isinstance(ellipse, dict):
        return False
    cx = _coerce_float(ellipse.get(ATTR_CX))
    cy = _coerce_float(ellipse.get(ATTR_CY))
    rx = _coerce_float(ellipse.get(ATTR_RX))
    ry = _coerce_float(ellipse.get(ATTR_RY))
    if cx is None or cy is None or rx is None or ry is None:
        return False
    if rx <= 0 or ry <= 0:
        return False
    dx = x_val - cx
    dy = y_val - cy
    return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1.0


def _point_in_polygon(x_val: float, y_val: float, polygon: ShapeData) -> bool:
    if not isinstance(polygon, dict):
        return False
    points = polygon.get(ATTR_POINTS)
    if not isinstance(points, list) or len(points) < POLYGON_MIN_POINTS:
        return False
    inside = False
    point_count = len(points)
    for idx in range(point_count):
        point_a = points[idx]
        point_b = points[(idx + 1) % point_count]
        if not isinstance(point_a, dict) or not isinstance(point_b, dict):
            return False
        x1 = _coerce_float(point_a.get("x"))
        y1 = _coerce_float(point_a.get("y"))
        x2 = _coerce_float(point_b.get("x"))
        y2 = _coerce_float(point_b.get("y"))
        if x1 is None or y1 is None or x2 is None or y2 is None:
            return False
        if (y1 > y_val) != (y2 > y_val):
            denominator = (y2 - y1) or _LINE_INTERSECTION_EPSILON
            x_at_y = x1 + (x2 - x1) * (y_val - y1) / denominator
            if x_at_y >= x_val:
                inside = not inside
    return inside


_SHAPE_TESTERS: dict[str, ShapeTester] = {
    "rect": _point_in_rect,
    "ellipse": _point_in_ellipse,
    "polygon": _point_in_polygon,
}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Create presence sensors for stored zones, and for zones added later."""
    from . import get_store  # noqa: PLC0415 - avoid a module import cycle

    store = get_store(hass)
    added: set[tuple[str, int]] = set()

    def _sync_entities() -> None:
        current = {
            (location, zone_id)
            for location, loc in store.locations.items()
            for zone_id in loc[STORE_ZONES]
        }
        added.intersection_update(current)
        new_entities = [
            ZonePresenceBinarySensor(store, location, zone_id)
            for location, zone_id in sorted(current - added)
        ]
        added.update(current - added)
        if new_entities:
            async_add_entities(new_entities)

    @callback
    def _zones_updated(_location: str) -> None:
        _sync_entities()

    entry.async_on_unload(
        async_dispatcher_connect(hass, SIGNAL_ZONES_UPDATED, _zones_updated)
    )
    _sync_entities()


class ZonePresenceBinarySensor(BinarySensorEntity):
    """Occupancy: any tracked target inside this zone's shape."""

    _attr_should_poll = False
    _attr_icon = "mdi:motion-sensor"
    _attr_device_class = BinarySensorDeviceClass.OCCUPANCY

    def __init__(self, store: ZoneStore, location: str, zone_id: int) -> None:
        """Initialize from the store."""
        self._store = store
        self._location = location
        self._zone_id = zone_id
        self._attr_is_on = False
        self._unsub_state_listener: Callable[[], None] | None = None

        self._attr_name = f"{location} Zone {zone_id} Presence"
        self._attr_unique_id = PRESENCE_SENSOR_UNIQUE_ID_FMT.format(
            location=slugify(location), zone_id=zone_id
        )
        self.entity_id = f"binary_sensor.{self._attr_unique_id}"

    async def async_added_to_hass(self) -> None:
        """Track zone updates and the location's coordinate entities."""

        @callback
        def _zones_updated(location: str) -> None:
            if location == self._location:
                self._track_coordinate_entities()
                self._evaluate_and_write()

        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_ZONES_UPDATED, _zones_updated)
        )
        self._track_coordinate_entities()
        self._evaluate_and_write(write=False)

    async def async_will_remove_from_hass(self) -> None:
        """Stop tracking coordinate entities."""
        if self._unsub_state_listener:
            self._unsub_state_listener()
            self._unsub_state_listener = None

    def _tracked_pairs(self) -> list[dict[str, str]]:
        pairs = self._store.location(self._location).get(STORE_ENTITIES, [])
        return pairs if isinstance(pairs, list) else []

    def _track_coordinate_entities(self) -> None:
        if self._unsub_state_listener:
            self._unsub_state_listener()
            self._unsub_state_listener = None

        entity_ids = [
            entity_id
            for pair in self._tracked_pairs()
            if isinstance(pair, dict)
            for entity_id in (pair.get("x"), pair.get("y"))
            if isinstance(entity_id, str)
        ]
        if entity_ids:
            self._unsub_state_listener = async_track_state_change_event(
                self.hass, entity_ids, self._handle_coordinate_update
            )

    @callback
    def _handle_coordinate_update(self, _event: Event[EventStateChangedData]) -> None:
        self._evaluate_and_write()

    def _evaluate_and_write(self, *, write: bool = True) -> None:
        self._attr_is_on = self._evaluate_presence()
        if write:
            self.async_write_ha_state()

    def _evaluate_presence(self) -> bool:
        zone_def = self._store.zone(self._location, self._zone_id)
        if zone_def is None:
            return False
        shape = zone_def.get(ATTR_SHAPE)
        shape_tester = _SHAPE_TESTERS.get(shape) if isinstance(shape, str) else None
        if shape_tester is None:
            return False
        data = zone_def.get(ATTR_DATA)

        rotation = self._store.location(self._location).get(ATTR_ROTATION_DEG)
        rotate = _build_point_rotator(rotation)

        return any(
            shape_tester(x_val, y_val, data)
            for x_val, y_val in self._iter_rotated_coordinates(rotate)
        )

    def _iter_rotated_coordinates(
        self, rotate: Callable[[float, float], tuple[float, float]]
    ) -> Iterator[tuple[float, float]]:
        for pair in self._tracked_pairs():
            if not isinstance(pair, dict):
                continue
            x_id = pair.get("x")
            y_id = pair.get("y")
            if not (isinstance(x_id, str) and isinstance(y_id, str)):
                continue
            coords = self._get_coordinate_pair(x_id, y_id)
            if coords is not None:
                yield rotate(*coords)

    def _get_coordinate_pair(
        self, x_entity_id: str, y_entity_id: str
    ) -> tuple[float, float] | None:
        x_state = self.hass.states.get(x_entity_id)
        y_state = self.hass.states.get(y_entity_id)
        if not self._states_are_valid(x_state, y_state):
            return None
        try:
            x_val = float(x_state.state)  # type: ignore[union-attr]
            y_val = float(y_state.state)  # type: ignore[union-attr]
        except (TypeError, ValueError):
            return None
        # Ignore origin (0,0) so default or uninitialized readings are skipped.
        if x_val == 0.0 and y_val == 0.0:
            return None
        return x_val, y_val

    @staticmethod
    def _states_are_valid(x_state: State | None, y_state: State | None) -> bool:
        return (
            x_state is not None
            and y_state is not None
            and x_state.state not in (STATE_UNKNOWN, STATE_UNAVAILABLE)
            and y_state.state not in (STATE_UNKNOWN, STATE_UNAVAILABLE)
        )
