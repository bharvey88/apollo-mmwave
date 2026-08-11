/**
 * The zone card's Lovelace config editor.
 *
 * The card used to carry its own dropdown, built out of an input, a div list
 * and a 200ms blur timer. Clicking an option only worked if the mouse button
 * came back up inside 200ms: the list was hidden before mouseup, so the item
 * never got its click and the selection silently did nothing. HA's own
 * `ha-device-picker` is what every other card uses and has no such race.
 *
 * `ha-device-picker` and `ha-textfield` belong to the Home Assistant frontend
 * and are not defined here, so these tests drive the editor the way HA does:
 * set properties on the elements it renders, dispatch the `value-changed` the
 * real elements dispatch, and read the config it emits back.
 */

import { describe, it, expect, vi } from "vitest";
import { ZoneMapCard } from "../src/zone-map/card";
import { ZoneMapCardEditor, firstLd2450DeviceId } from "../src/zone-map/editor";

const CARD_TYPE = "custom:apollo-radar-zone-map-card";

/** A hass whose registry holds one LD2450 radar and one unrelated device. */
function fakeHass() {
  return {
    states: {},
    devices: {
      lamp: { name: "Hall lamp" },
      radar: { name: "Office radar" },
    },
    entities: {
      "light.hall": { device_id: "lamp" },
      "sensor.office_ld2450_target_1_x": { device_id: "radar" },
      "sensor.office_ld2450_target_1_y": { device_id: "radar" },
    },
  } as any;
}

/** The editor, configured and given a hass, as HA sets one up. */
function mountEditor(config: Record<string, any> = {}) {
  const editor = new ZoneMapCardEditor();
  editor.setConfig({ type: CARD_TYPE, device_id: "", ...config } as any);
  editor.hass = fakeHass();
  return editor;
}

function picker(editor: ZoneMapCardEditor): any {
  return editor.shadowRoot!.querySelector("ha-device-picker");
}

function titleField(editor: ZoneMapCardEditor): any {
  return editor.shadowRoot!.querySelector("ha-textfield");
}

/** The config from the last config-changed the editor fired. */
function emitted(editor: ZoneMapCardEditor) {
  const seen: any[] = [];
  editor.addEventListener("config-changed", (event: any) => {
    seen.push(event.detail?.config);
  });
  return seen;
}

describe("zone map card editor wiring", () => {
  it("exposes a config element and a stub config pointing at a real radar", () => {
    const element = (ZoneMapCard as any).getConfigElement();
    expect(element.tagName.toLowerCase()).toBe("apollo-radar-zone-map-card-editor");
    expect(customElements.get("apollo-radar-zone-map-card-editor")).toBeDefined();

    const stub = (ZoneMapCard as any).getStubConfig(fakeHass());
    expect(stub.type).toBe(CARD_TYPE);
    // A card dragged out of the Lovelace picker used to open straight onto the
    // "device_id required" error, because the stub named no device.
    expect(stub.device_id).toBe("radar");
  });

  it("finds no device when nothing on the system is an LD2450", () => {
    const hass = { states: {}, devices: { lamp: {} }, entities: { "light.hall": { device_id: "lamp" } } } as any;
    expect(firstLd2450DeviceId(hass)).toBeUndefined();
    expect((ZoneMapCard as any).getStubConfig(hass).device_id).toBe("");
  });

  it("finds the radar from the entity registry when hass carries no devices", () => {
    const hass = fakeHass();
    delete hass.devices;
    expect(firstLd2450DeviceId(hass)).toBe("radar");
  });
});

describe("zone map card editor rendering", () => {
  it("renders a device picker and a title field, filtered to LD2450 radars", () => {
    const editor = mountEditor({ device_id: "radar", title: "Office" });

    expect(picker(editor).value).toBe("radar");
    expect(picker(editor).hass).toBeTruthy();
    expect(picker(editor).deviceFilter({ id: "radar" })).toBe(true);
    // Every other device on the system would be a card that cannot draw.
    expect(picker(editor).deviceFilter({ id: "lamp" })).toBe(false);
    expect(titleField(editor).value).toBe("Office");
  });

  it("has no hand-rolled combobox left anywhere in the editor", () => {
    const editor = mountEditor();
    expect(editor.shadowRoot!.querySelector(".combo-list")).toBeNull();
    expect(editor.shadowRoot!.querySelector(".combobox-wrapper")).toBeNull();
  });
});

describe("zone map card editor changes", () => {
  it("emits config-changed when the device picker changes", () => {
    const editor = mountEditor({ device_id: "" });
    const configs = emitted(editor);

    picker(editor).dispatchEvent(
      new CustomEvent("value-changed", { detail: { value: "dev999" } })
    );

    expect(configs).toHaveLength(1);
    expect(configs[0].device_id).toBe("dev999");
    expect(configs[0].type).toBe(CARD_TYPE);
  });

  it("bubbles the change out of the shadow root, where HA listens", () => {
    const editor = mountEditor();
    const handler = vi.fn();
    document.body.appendChild(editor);
    document.body.addEventListener("config-changed", handler);

    picker(editor).dispatchEvent(
      new CustomEvent("value-changed", { detail: { value: "dev999" } })
    );

    expect(handler).toHaveBeenCalled();
    document.body.removeEventListener("config-changed", handler);
    editor.remove();
  });

  it("keeps the rest of the config when one field changes", () => {
    const editor = mountEditor({ device_id: "radar", title: "Office", unit_display: true });
    const configs = emitted(editor);

    titleField(editor).value = "Kitchen";
    titleField(editor).dispatchEvent(new CustomEvent("input"));

    expect(configs[0]).toMatchObject({
      type: CARD_TYPE,
      device_id: "radar",
      title: "Kitchen",
      unit_display: true,
    });
  });

  it("drops an emptied title rather than writing an empty string", () => {
    const editor = mountEditor({ device_id: "radar", title: "Office" });
    const configs = emitted(editor);

    titleField(editor).value = "";
    titleField(editor).dispatchEvent(new CustomEvent("input"));

    expect(configs[0]).not.toHaveProperty("title");
    expect(configs[0].device_id).toBe("radar");
  });

  it("says nothing when the picker reports the device it already holds", () => {
    // HA re-renders the editor on every config-changed, and the picker echoes
    // its own value back. Re-emitting an identical config loops.
    const editor = mountEditor({ device_id: "radar" });
    const configs = emitted(editor);

    picker(editor).dispatchEvent(
      new CustomEvent("value-changed", { detail: { value: "radar" } })
    );

    expect(configs).toHaveLength(0);
  });
});
