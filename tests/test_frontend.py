"""
Frontend asset registration: Lovelace resources are the load-bearing path.

HA's service worker caches the app shell, so ``add_extra_js_url`` never
reaches a browser that cached the shell before the integration was installed.
Those clients only get the module through the Lovelace resource collection —
if that registration fails, the dashboard times out waiting for the strategy
element with no way to recover short of a hard refresh.
"""

from __future__ import annotations

import pytest
from homeassistant.components.lovelace.const import LOVELACE_DATA, ConfigNotFound
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.apollo_mmwave.const import (
    CONF_AUTO_CREATE_VIEW,
    DASHBOARD_STRATEGY_TYPE,
    DASHBOARD_TITLE,
    DASHBOARD_URL_PATH,
    DATA_ASSETS_REGISTERED,
    DOMAIN,
)
from custom_components.apollo_mmwave.frontend import (
    async_register_dashboard,
    async_register_frontend_assets,
    async_remove_dashboard,
)

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


@pytest.fixture
def dashboard_entry() -> MockConfigEntry:
    """Return an entry with the sidebar dashboard turned ON."""
    return MockConfigEntry(
        domain=DOMAIN,
        title="Apollo mmWave",
        data={},
        options={CONF_AUTO_CREATE_VIEW: True},
        unique_id=DOMAIN,
    )


async def _dashboard_config(hass) -> dict | None:
    """Return the stored Lovelace config for our url path, or None."""
    config = hass.data[LOVELACE_DATA].dashboards.get(DASHBOARD_URL_PATH)
    if config is None:
        return None
    try:
        return await config.async_load(force=False)
    except ConfigNotFound:
        return None


async def test_dashboard_appears_with_a_title_and_can_be_taken_over(
    hass, hass_ws_client, dashboard_entry
) -> None:
    """The row on the dashboards page has our title, and "take control" saves."""
    await setup_integration(hass, dashboard_entry)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "lovelace/dashboards/list"})
    rows = (await client.receive_json())["result"]
    ours = next(r for r in rows if r["url_path"] == DASHBOARD_URL_PATH)
    assert ours["title"] == DASHBOARD_TITLE

    stored = await _dashboard_config(hass)
    assert stored["strategy"]["type"] == DASHBOARD_STRATEGY_TYPE

    await client.send_json_auto_id(
        {
            "type": "lovelace/config/save",
            "url_path": DASHBOARD_URL_PATH,
            "config": {"views": [{"title": "Mine", "cards": []}]},
        }
    )
    assert (await client.receive_json())["success"] is True


async def test_removing_the_entry_removes_the_dashboard(hass, dashboard_entry) -> None:
    """Deleting the config entry takes the collection item with it."""
    await setup_integration(hass, dashboard_entry)
    assert DASHBOARD_URL_PATH in hass.data[LOVELACE_DATA].dashboards

    await hass.config_entries.async_remove(dashboard_entry.entry_id)
    await hass.async_block_till_done()

    assert DASHBOARD_URL_PATH not in hass.data[LOVELACE_DATA].dashboards


async def test_taken_over_dashboard_is_never_overwritten_or_deleted(
    hass, dashboard_entry
) -> None:
    """Once the strategy key is gone the config is the user's, not ours."""
    await setup_integration(hass, dashboard_entry)
    mine = {"views": [{"title": "Mine", "cards": [{"type": "markdown"}]}]}
    await hass.data[LOVELACE_DATA].dashboards[DASHBOARD_URL_PATH].async_save(mine)

    # Re-registering (a restart, or an options change) must not reseed it.
    await async_register_dashboard(hass, [])
    await hass.async_block_till_done()
    assert await _dashboard_config(hass) == mine

    # Nor may unloading delete a dashboard the user now owns.
    await async_remove_dashboard(hass)
    await hass.async_block_till_done()
    assert DASHBOARD_URL_PATH in hass.data[LOVELACE_DATA].dashboards
    assert await _dashboard_config(hass) == mine
