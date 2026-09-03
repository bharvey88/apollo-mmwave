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
import { apolloModelInfo, isEsphomeDevice } from "../profiles";
import type { HomeAssistant } from "../types";

export const ZONE_MAP_CARD_TYPE = "custom:apollo-radar-zone-map-card";
export const ZONE_MAP_EDITOR_TAG = "apollo-radar-zone-map-card-editor";

export interface ZoneMapCardConfig {
  type: string;
  device_id?: string;
  title?: string;
  /** Absent: follow the Home Assistant theme. true/false: force dark/light. */
  dark_mode?: boolean;
  [key: string]: unknown;
}

/** The three states of the appearance dropdown, mapped onto `dark_mode`. */
export type ThemeChoice = "auto" | "light" | "dark";

export function themeChoiceFromConfig(config: ZoneMapCardConfig): ThemeChoice {
  if (config.dark_mode === undefined) return "auto";
  return config.dark_mode ? "dark" : "light";
}

/** `ha-selector` with the properties the editor sets on it. */
interface SelectorElement extends HTMLElement {
  hass?: HomeAssistant;
  selector?: Record<string, unknown>;
  value?: string;
  label?: string;
}

const THEME_SELECTOR = {
  select: {
    mode: "dropdown",
    options: [
      { value: "auto", label: "Follow Home Assistant theme" },
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
    ],
  },
};

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
  private _theme?: SelectorElement;

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
    if (!this._picker || !this._title || !this._theme) return;
    this._picker.hass = this._hass;
    this._theme.hass = this._hass;
    const deviceId = String(this._config.device_id ?? "");
    const title = String(this._config.title ?? "");
    const theme = themeChoiceFromConfig(this._config);
    // Only on a real change. HA re-renders the editor on every state tick, and
    // re-assigning a text field's value moves the caret to the end of it.
    if (this._picker.value !== deviceId) this._picker.value = deviceId;
    if (this._title.value !== title) this._title.value = title;
    if (this._theme.value !== theme) this._theme.value = theme;
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
    // Registered target sensors are the proof; the registry model is the
    // fallback, so a radar that is offline right now (its entities are still
    // registered, but a device added moments ago may have none yet) can still
    // be picked and starts drawing when it reports in.
    picker.deviceFilter = (device: FilterableDevice) =>
      !!this._hass &&
      !!device?.id &&
      (hasLd2450Device(this._hass, device.id) ||
        (isEsphomeDevice(this._hass, device.id) &&
          (apolloModelInfo(this._hass.devices?.[device.id])?.ld2450 ?? false)));
    picker.addEventListener("value-changed", (event: Event) => {
      const value = (event as CustomEvent).detail?.value;
      this._commit("device_id", typeof value === "string" ? value : "");
    });

    const title = document.createElement("ha-textfield") as TextFieldElement;
    title.label = "Title (optional)";
    title.addEventListener("input", () => {
      this._commit("title", String(this._title?.value ?? ""));
    });

    const theme = document.createElement("ha-selector") as SelectorElement;
    theme.label = "Appearance";
    theme.selector = THEME_SELECTOR;
    theme.addEventListener("value-changed", (event: Event) => {
      // ha-selector re-dispatches its child's value-changed; stop it here so
      // Lovelace does not also see the raw one bubbling past the editor.
      event.stopPropagation();
      const value = (event as CustomEvent).detail?.value;
      this._commitTheme(
        value === "light" || value === "dark" ? value : "auto"
      );
    });

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent =
      "The card tracks this radar's own detected targets. To point it at other" +
      " X/Y sensors, call the apollo_mmwave.update_zone service with an" +
      " entities list.";

    form.append(picker, title, theme, hint);
    this.shadowRoot.append(style, form);
    this._picker = picker;
    this._title = title;
    this._theme = theme;
  }

  /** Fold the appearance choice into `dark_mode`: "auto" drops the key so the
   *  card follows the Home Assistant theme again. */
  private _commitTheme(choice: ThemeChoice): void {
    if (themeChoiceFromConfig(this._config) === choice) return;
    const config: ZoneMapCardConfig = { ...this._config };
    if (choice === "auto") delete config.dark_mode;
    else config.dark_mode = choice === "dark";
    this._config = config;
    this._emit(config);
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
    this._emit(config);
  }

  private _emit(config: ZoneMapCardConfig): void {
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
