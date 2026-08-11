/**
 * Websocket client for the integration's zone API.
 *
 * The pre-2.0 card built `sensor.apollo_mmwave_<slug>_zone_<n>` from a display
 * name and read its attributes. That made configuration depend on entity
 * naming and on the entity being available, and an unavailable entity has its
 * attributes stripped, so the card would read an empty config and write it
 * back over the real one. Nothing here constructs an entity id.
 */

export const DOMAIN = "apollo_mmwave";
export const ZONES_GET = `${DOMAIN}/zones/get`;
export const ZONES_SUBSCRIBE = `${DOMAIN}/zones/subscribe`;
/** Home Assistant's own config entry feed, used to notice a reload. */
export const CONFIG_ENTRIES_SUBSCRIBE = "config_entries/subscribe";

export interface TargetPair {
  x: string;
  y: string;
}

export interface ZoneDef {
  shape: string;
  data: Record<string, any> | null;
  name?: string;
}

export interface ZoneConfig {
  /** Keyed by zone id. Ints in the store, strings once through JSON. */
  zones: Record<string, ZoneDef>;
  /**
   * The pairs the user picked, or null if they never picked any.
   *
   * The distinction is load-bearing. null means the radar's auto-detected
   * targets are in use, so the card offers `suggested_entities`. [] means the
   * user cleared the list and wants nothing tracked. Collapsing the two
   * re-enables auto-detection for the one user who switched it off.
   */
  entities: TargetPair[] | null;
  rotation_deg: number | null;
  label: string | null;
  /** What the radar detected, offered regardless of what the user picked. */
  suggested_entities: TargetPair[];
}

export type Unsubscribe = () => void | Promise<void>;

/** The slice of Home Assistant this module needs. */
export interface ZoneApiHass {
  callWS<T>(message: Record<string, any>): Promise<T>;
  connection: {
    subscribeMessage<T>(
      callback: (message: T) => void,
      subscription: Record<string, any>
    ): Promise<Unsubscribe>;
  };
}

export interface ZoneConnectionHandlers {
  onConfig: (config: ZoneConfig) => void;
  /** Called with something a user can read, never with a blank map. */
  onError: (message: string) => void;
}

interface ConfigEntryChange {
  type?: string;
  entry?: { domain?: string; state?: string };
}

/** Read one radar's zone configuration. */
export async function fetchZones(
  hass: ZoneApiHass,
  deviceId: string
): Promise<ZoneConfig> {
  return hass.callWS<ZoneConfig>({ type: ZONES_GET, device_id: deviceId });
}

/** Receive that configuration again on every change. */
export async function subscribeZones(
  hass: ZoneApiHass,
  deviceId: string,
  callback: (config: ZoneConfig) => void
): Promise<Unsubscribe> {
  return hass.connection.subscribeMessage<ZoneConfig>(callback, {
    type: ZONES_SUBSCRIBE,
    device_id: deviceId,
  });
}

/**
 * Call back whenever an Apollo mmWave config entry finishes loading.
 *
 * Resolves to null when the feed is refused. It is an admin-only command, so a
 * non-admin viewing a dashboard loses reload recovery, not the card.
 */
export async function subscribeEntryLoads(
  hass: ZoneApiHass,
  callback: () => void
): Promise<Unsubscribe | null> {
  try {
    return await hass.connection.subscribeMessage<ConfigEntryChange[]>(
      (changes) => {
        const list = Array.isArray(changes) ? changes : [changes];
        // "added" and "updated" both carry the loaded state, and an options
        // change reports loaded too. Re-subscribing on one of those is a wasted
        // round trip, which is cheaper than missing a reload.
        if (
          list.some(
            (change) =>
              change?.entry?.domain === DOMAIN && change?.entry?.state === "loaded"
          )
        ) {
          callback();
        }
      },
      { type: CONFIG_ENTRIES_SUBSCRIBE }
    );
  } catch {
    return null;
  }
}

function describeError(error: any, deviceId: string): string {
  const code = error?.code;
  if (code === "not_found") {
    return (
      `Home Assistant has no device with id ${deviceId}. The radar was probably` +
      " removed and re-added; pick it again in this card's settings."
    );
  }
  if (code === "not_loaded") {
    return (
      "Apollo mmWave is not loaded, so this radar's zones cannot be read." +
      " They will come back on their own once the integration finishes loading."
    );
  }
  return error?.message
    ? String(error.message)
    : "Could not read this radar's zone configuration.";
}

/**
 * Keep a card's copy of one radar's configuration current.
 *
 * Opens the live subscription, delivers the current configuration once, and
 * re-opens both after a config entry reload: unloading the entry tears live
 * subscriptions down without telling the client, so a card would otherwise sit
 * on stale data until someone reloaded the page.
 *
 * Never rejects. A failure is reported through `onError` because the card has
 * to show something other than an empty zone map.
 */
export async function connectZones(
  hass: ZoneApiHass,
  deviceId: string,
  handlers: ZoneConnectionHandlers
): Promise<Unsubscribe> {
  let disposed = false;
  let unsubscribeZones: Unsubscribe | null = null;

  const closeZones = async () => {
    const current = unsubscribeZones;
    unsubscribeZones = null;
    if (!current) return;
    try {
      await current();
    } catch {
      // The server side is already gone after a reload, which is the case this
      // exists for. Nothing to recover.
    }
  };

  const open = async () => {
    await closeZones();
    // Subscribe before reading so no change can slip through the gap between
    // the two. That means a push can beat the read, in which case the read is
    // the older of the two and gets dropped.
    let pushed = false;
    try {
      unsubscribeZones = await subscribeZones(hass, deviceId, (config) => {
        if (disposed) return;
        pushed = true;
        handlers.onConfig(config);
      });
      const config = await fetchZones(hass, deviceId);
      if (disposed || pushed) return;
      handlers.onConfig(config);
    } catch (error) {
      if (disposed) return;
      handlers.onError(describeError(error, deviceId));
    }
  };

  await open();

  const unsubscribeEntries = await subscribeEntryLoads(hass, () => {
    if (disposed) return;
    void open();
  });

  return async () => {
    disposed = true;
    await closeZones();
    if (unsubscribeEntries) {
      try {
        await unsubscribeEntries();
      } catch {
        // Same as above: a closed connection has nothing left to unsubscribe.
      }
    }
  };
}
