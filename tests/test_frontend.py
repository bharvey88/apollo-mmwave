"""
Frontend asset registration: Lovelace resources are the load-bearing path.

HA's service worker caches the app shell, so ``add_extra_js_url`` never
reaches a browser that cached the shell before the integration was installed.
Those clients only get the module through the Lovelace resource collection —
if that registration fails, the dashboard times out waiting for the strategy
element with no way to recover short of a hard refresh.
"""

from __future__ import annotations

from homeassistant.components.lovelace.const import LOVELACE_DATA

from custom_components.apollo_mmwave.const import DATA_ASSETS_REGISTERED, DOMAIN
from custom_components.apollo_mmwave.frontend import async_register_frontend_assets

from .conftest import setup_integration


async def test_lovelace_resources_registered(hass, config_entry) -> None:
    """Both bundles end up in the storage-mode resource collection."""
    await setup_integration(hass, config_entry)

    resources = hass.data[LOVELACE_DATA].resources
    items = resources.async_items()
    urls = {str(item.get("url", "")).partition("?")[0] for item in items}

    assert "/apollo_mmwave/apollo-radar-tuning.js" in urls
    assert "/apollo_mmwave/zone-mapper-card.js" in urls
    # All entries are module resources with a cache-busting version. The
    # stored field is "type" (the WS create API takes "res_type").
    for item in items:
        url = str(item.get("url", ""))
        if url.startswith("/apollo_mmwave/"):
            assert item.get("type") == "module"
            assert "?v=" in url


async def test_resource_version_updated_on_upgrade(hass, config_entry) -> None:
    """A stale ?v= entry is repointed at the current version, not duplicated."""
    await setup_integration(hass, config_entry)
    resources = hass.data[LOVELACE_DATA].resources
    ours = [
        i
        for i in resources.async_items()
        if str(i.get("url", "")).startswith("/apollo_mmwave/apollo-radar-tuning.js")
    ]
    assert len(ours) == 1
    old_id = ours[0]["id"]
    await resources.async_update_item(
        old_id, {"url": "/apollo_mmwave/apollo-radar-tuning.js?v=0.0.1"}
    )

    # Re-register (simulates the next boot after an upgrade).
    hass.data[DOMAIN].pop(DATA_ASSETS_REGISTERED, None)
    await async_register_frontend_assets(hass)

    ours = [
        i
        for i in resources.async_items()
        if str(i.get("url", "")).startswith("/apollo_mmwave/apollo-radar-tuning.js")
    ]
    assert len(ours) == 1
    assert ours[0]["id"] == old_id
    assert "?v=0.0.1" not in ours[0]["url"]
