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
from homeassistant.components.frontend import DATA_PANELS
from homeassistant.components.lovelace.const import LOVELACE_DATA, ConfigNotFound
from homeassistant.setup import async_setup_component
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
    _dashboards_collection,
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
    assert "/apollo_mmwave/apollo-radar-zone-map-card.js" in urls
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


async def test_stale_bundle_resource_is_removed(hass, config_entry) -> None:
    """
    A resource left over from a renamed bundle is deleted, not left 404ing.

    Renaming a bundle strands the old resource entry: it points at a file that
    no longer exists, so every dashboard load fetches a 404. Only entries under
    our own static path are swept; everyone else's cards are untouchable.
    """
    assert await async_setup_component(hass, "lovelace", {})
    resources = hass.data[LOVELACE_DATA].resources
    if not resources.loaded:
        await resources.async_load()
        resources.loaded = True
    await resources.async_create_item(
        {"res_type": "module", "url": "/apollo_mmwave/zone-mapper-card.js?v=1.1.0"}
    )
    await resources.async_create_item(
        {"res_type": "module", "url": "/local/community/somebody-elses-card.js"}
    )

    await setup_integration(hass, config_entry)

    urls = {str(i.get("url", "")) for i in resources.async_items()}
    assert not any(u.startswith("/apollo_mmwave/zone-mapper-card.js") for u in urls)
    assert "/local/community/somebody-elses-card.js" in urls
    assert any(
        u.startswith("/apollo_mmwave/apollo-radar-zone-map-card.js") for u in urls
    )


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

    # 1.3.1 shipped with no panel at all: the dashboards list reads a different
    # dict, so it alone would not have caught that.
    assert DASHBOARD_URL_PATH in hass.data[DATA_PANELS]

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
    """Deleting the config entry takes the collection item and panel with it."""
    await setup_integration(hass, dashboard_entry)
    assert DASHBOARD_URL_PATH in hass.data[LOVELACE_DATA].dashboards

    await hass.config_entries.async_remove(dashboard_entry.entry_id)
    await hass.async_block_till_done()

    assert DASHBOARD_URL_PATH not in hass.data[LOVELACE_DATA].dashboards
    assert DASHBOARD_URL_PATH not in hass.data[DATA_PANELS]


async def test_reloading_the_entry_keeps_the_users_dashboard_edits(
    hass, dashboard_entry
) -> None:
    """A reload must not delete and recreate the row, wiping renames and icons."""
    await setup_integration(hass, dashboard_entry)
    collection = _dashboards_collection(hass)
    item = next(
        i for i in collection.async_items() if i["url_path"] == DASHBOARD_URL_PATH
    )
    await collection.async_update_item(
        item["id"], {"title": "Radar", "icon": "mdi:home", "show_in_sidebar": False}
    )

    await hass.config_entries.async_reload(dashboard_entry.entry_id)
    await hass.async_block_till_done()

    item = next(
        i for i in collection.async_items() if i["url_path"] == DASHBOARD_URL_PATH
    )
    assert item["title"] == "Radar"
    assert item["icon"] == "mdi:home"
    assert item["show_in_sidebar"] is False


async def test_a_foreign_dashboard_on_our_url_path_is_never_written_to(
    hass, dashboard_entry
) -> None:
    """A user's own dashboard here has no config yet; that is not a free space."""
    dashboard_entry.add_to_hass(hass)
    # The integration is not up yet, so this row is unmistakably not ours. It
    # has no stored Lovelace config, exactly like one made in the UI and not
    # yet opened.
    assert await async_setup_component(hass, "lovelace", {})
    collection = _dashboards_collection(hass)
    await collection.async_create_item(
        {"url_path": DASHBOARD_URL_PATH, "title": "My Radar Room"}
    )

    assert await hass.config_entries.async_setup(dashboard_entry.entry_id)
    await hass.async_block_till_done()

    assert await _dashboard_config(hass) is None

    # And turning the option off must not delete what we never created.
    await async_remove_dashboard(hass)
    await hass.async_block_till_done()
    item = next(
        i for i in collection.async_items() if i["url_path"] == DASHBOARD_URL_PATH
    )
    assert item["title"] == "My Radar Room"


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


async def test_user_added_strategy_options_survive_a_re_register(
    hass, dashboard_entry
) -> None:
    """`distance_unit` typed into the raw editor is not ours to erase."""
    await setup_integration(hass, dashboard_entry)
    dashboard = hass.data[LOVELACE_DATA].dashboards[DASHBOARD_URL_PATH]
    await dashboard.async_save(
        {"strategy": {"type": DASHBOARD_STRATEGY_TYPE, "distance_unit": "ft"}}
    )

    # A restart or an options change re-registers with a device selection.
    await async_register_dashboard(hass, ["dev1"])
    await hass.async_block_till_done()
    stored = await _dashboard_config(hass)
    assert stored["strategy"] == {
        "type": DASHBOARD_STRATEGY_TYPE,
        "distance_unit": "ft",
        "devices": ["dev1"],
    }

    # Clearing the selection drops `devices` and keeps the user's key.
    await async_register_dashboard(hass, [])
    await hass.async_block_till_done()
    stored = await _dashboard_config(hass)
    assert stored["strategy"] == {
        "type": DASHBOARD_STRATEGY_TYPE,
        "distance_unit": "ft",
    }
