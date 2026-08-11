/**
 * The Lovelace config editor for the zone-drawing card.
 *
 * The card used to carry its own device and X/Y pair pickers, hand-rolled out
 * of a text input, a div list and a 200ms blur timer. A press held longer than
 * that hid the item before mouseup, so the click never landed and the choice
 * silently did nothing. This uses `ha-device-picker`, the same element every
 * built-in card uses.
 *
 * There is no pair-picking UI here on purpose. The integration resolves a
 * radar's LD2450 X/Y target sensors itself, and the card says which set it is
 * drawing. Overriding that is a DIY move, and the `apollo_mmwave.update_zone`
 * service takes `entities` and `clear_entities` for it.
 *
 * `ha-device-picker` and `ha-textfield` are Home Assistant frontend elements.
 * They are not bundled here and they are not defined outside HA, which is why
 * this builds plain DOM and assigns properties rather than binding a template
 * to elements it cannot see.
 */

import { registerElement } from "../register";
import { hasLd2450Device } from "../ld2450";
import type { HomeAssistant } from "../types";

export const ZONE_MAP_CARD_TYPE = "custom:apollo-radar-zone-map-card";
export const ZONE_MAP_EDITOR_TAG = "apollo-radar-zone-map-card-editor";

export interface ZoneMapCardConfig {
  type: string;
  device_id?: string;
  title?: string;
  [key: string]: unknown;
}

/** The bit of `ha-device-picker`'s filter argument we read. */
interface FilterableDevice {
  id: string;
}

/** `ha-device-picker` with the properties we set on it, none of which are
 *  attributes: the picker is a property-driven element. */
interface DevicePickerElement extends HTMLElement {
  hass?: HomeAssistant;
  value?: string;
  label?: string;
  deviceFilter?: (device: FilterableDevice) => boolean;
}

interface TextFieldElement extends HTMLElement {
  value?: string;
  label?: string;
}

/**
 * The first device on the system with LD2450 target sensors, if any.
 *
 * Detection is `hasLd2450Device` and nothing else. A second implementation of
 * "is this a tracking radar" can only ever disagree with the one that counts.
 */
export function firstLd2450DeviceId(hass: HomeAssistant | undefined): string | undefined {
  if (!hass) return undefined;
  const fromRegistry = Object.keys(hass.devices ?? {});
  // A hass without a device registry still lists every entity's device id, and
  // that is all the check needs.
  const candidates = fromRegistry.length
    ? fromRegistry
    : Array.from(
        new Set(
          Object.values(hass.entities ?? {})
            .map((entry) => entry?.device_id)
            .filter((id): id is string => !!id)
        )
      );
  return candidates.find((id) => hasLd2450Device(hass, id));
}

const STYLE = `
  :host { display: block; }
  .form { display: flex; flex-direction: column; gap: 16px; padding: 8px 0; }
  .hint { font-size: 12px; color: var(--secondary-text-color); }
`;

export class ZoneMapCardEditor extends HTMLElement {
  private _config: ZoneMapCardConfig = { type: ZONE_MAP_CARD_TYPE };
  private _hass?: HomeAssistant;
  private _picker?: DevicePickerElement;
  private _title?: TextFieldElement;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  public setConfig(config: ZoneMapCardConfig): void {
    this._config = { ...config };
    this._render();
  }

  public set hass(hass: HomeAssistant | undefined) {
    this._hass = hass;
    this._render();
  }

  public get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  private _render(): void {
    this._build();
    if (!this._picker || !this._title) return;
    this._picker.hass = this._hass;
    const deviceId = String(this._config.device_id ?? "");
    const title = String(this._config.title ?? "");
    // Only on a real change. HA re-renders the editor on every state tick, and
    // re-assigning a text field's value moves the caret to the end of it.
    if (this._picker.value !== deviceId) this._picker.value = deviceId;
    if (this._title.value !== title) this._title.value = title;
  }

  /** The DOM is built once and then updated. HA sets `hass` on every state
   *  tick, and rebuilding under the user would drop focus mid-word. */
  private _build(): void {
    if (this._picker || !this.shadowRoot) return;

    const style = document.createElement("style");
    style.textContent = STYLE;

    const form = document.createElement("div");
    form.className = "form";

    const picker = document.createElement("ha-device-picker") as DevicePickerElement;
    picker.label = "Radar";
    // Reads this._hass at call time: HA hands the editor a new hass object on
    // every state change, and a filter closed over the first one would answer
    // from a registry that has since changed.
    picker.deviceFilter = (device: FilterableDevice) =>
      !!this._hass && !!device?.id && hasLd2450Device(this._hass, device.id);
    picker.addEventListener("value-changed", (event: Event) => {
      const value = (event as CustomEvent).detail?.value;
      this._commit("device_id", typeof value === "string" ? value : "");
    });

    const title = document.createElement("ha-textfield") as TextFieldElement;
    title.label = "Title (optional)";
    title.addEventListener("input", () => {
      this._commit("title", String(this._title?.value ?? ""));
    });

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent =
      "The card tracks this radar's own detected targets. To point it at other" +
      " X/Y sensors, call the apollo_mmwave.update_zone service with an" +
      " entities list.";

    form.append(picker, title, hint);
    this.shadowRoot.append(style, form);
    this._picker = picker;
    this._title = title;
  }

  /**
   * Fold one field into the config and hand the whole thing to Lovelace.
   *
   * An empty title is dropped rather than written as `title: ""`, and a value
   * equal to the one already held emits nothing: HA re-renders the editor from
   * every `config-changed`, and the pickers echo their value back on re-render.
   */
  private _commit(key: "device_id" | "title", value: string): void {
    const current = this._config[key];
    if (current === value || (value === "" && current === undefined)) return;

    const config: ZoneMapCardConfig = { ...this._config, [key]: value };
    if (key === "title" && value === "") delete config.title;
    this._config = config;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true,
      })
    );
  }
}

registerElement(ZONE_MAP_EDITOR_TAG, ZoneMapCardEditor);
