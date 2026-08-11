"""
LD2450 tracking-radar target sensors for a device.

The LD2450 in R_PRO-1 and MTR-1 reports moving-target positions as one X and
one Y sensor per target, named ``sensor.<base>_ld2450_target_<n>_x`` / ``_y``
by the firmware. Resolving those from the entity registry is what lets the
card stop asking the user to hand-pick them.

Matching is on the entity id suffix rather than the whole id, so a renamed
prefix does not break detection, and the optional trailing ``_2`` absorbs Home
Assistant's dedup suffix. The target number sits before those dedup digits, so
it cannot be misread as one.

This is the Python twin of ``frontend-src/src/ld2450.ts``. The two regexes and
the pairing rule (an X is only offered with the Y of the same target number)
are shared, so change both together.

One difference is deliberate: this side drops disabled entities, the TypeScript
does not. It cannot. It reads ``hass.entities``, which carries no reliable
disabled signal, while this reads the entity registry, which does. So a target
whose Y is disabled yields a pair there and nothing here. Do not "fix" that by
loosening this side. From Task 6 on, the backend is the authoritative source of
suggested pairs and the stricter answer is the correct one.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from homeassistant.helpers import entity_registry as er

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

TARGET_X = re.compile(r"_ld2450_target_(\d+)_x(?:_\d+)?$")
TARGET_Y = re.compile(r"_ld2450_target_(\d+)_y(?:_\d+)?$")


def resolve_target_pairs(hass: HomeAssistant, device_id: str) -> list[dict[str, str]]:
    """Return the device's LD2450 X/Y sensor pairs, ordered by target number."""
    xs: dict[int, str] = {}
    ys: dict[int, str] = {}
    for entry in er.async_entries_for_device(
        er.async_get(hass), device_id, include_disabled_entities=False
    ):
        if entry.domain != "sensor":
            continue
        object_id = entry.entity_id.partition(".")[2]
        if match := TARGET_X.search(object_id):
            # First writer wins: a duplicate target number is a misnamed entity,
            # and the registry's own order is the closest thing to canonical.
            xs.setdefault(int(match.group(1)), entry.entity_id)
        elif match := TARGET_Y.search(object_id):
            ys.setdefault(int(match.group(1)), entry.entity_id)
    # A half-present target (Y disabled, say) has no drawable position, so it is
    # dropped rather than returned incomplete.
    return [{"x": xs[n], "y": ys[n]} for n in sorted(xs) if n in ys]
