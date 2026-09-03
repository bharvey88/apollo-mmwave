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
  /** Unit the presence sensors scale target readings by; null means mm. */
  input_units?: string | null;
  /** What the radar detected, offered regardless of what the user picked. */
  suggested_entities: TargetPair[];
}

export type Unsubscribe = () => void | Promise<void>;

/**
 * Backoff for reopening while the integration is unloaded, in milliseconds.
 *
 * Bounded, because after this much the entry is not mid-reload, it is broken or
 * disabled, and a card must not hammer the websocket forever. The config entry
 * feed covers a reload for admins; this covers everyone else, whose only other
 * option is a manual page reload.
 */
export const RETRY_DELAYS_MS = [1000, 2000, 5000, 10000, 20000];

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
        // round trip, which is cheaper than missing a reload. The feed's first
        // message is a dump of every existing entry with `type: null`; that is
        // not a reload, and reacting to it opened every card twice.
        if (
          list.some(
            (change) =>
              (change?.type === "updated" || change?.type === "added") &&
              change?.entry?.domain === DOMAIN &&
              change?.entry?.state === "loaded"
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

export const ERR_NOT_LOADED = "not_loaded";
export const ERR_NOT_FOUND = "not_found";

function describeError(error: any, deviceId: string, willRetry: boolean): string {
  const code = error?.code;
  if (code === ERR_NOT_FOUND) {
    return (
      `Home Assistant has no device with id ${deviceId}. The radar was probably` +
      " removed and re-added; pick it again in this card's settings."
    );
  }
  if (code === ERR_NOT_LOADED) {
    // Only promise recovery while a retry is still coming. Saying the zones
    // return on their own and then never trying again is the same kind of lie
    // as a save toast for a save that did not happen.
    return willRetry
      ? "Apollo mmWave is not loaded, so this radar's zones cannot be read." +
          " They will come back on their own once the integration finishes loading."
      : "Apollo mmWave is still not loaded, so this radar's zones cannot be" +
          " read. Reload the page once the integration is back.";
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
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryIndex = 0;

  const cancelRetry = () => {
    if (retryTimer === null) return;
    clearTimeout(retryTimer);
    retryTimer = null;
  };

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
    cancelRetry();
    await closeZones();
    // Subscribe before reading so no change can slip through the gap between
    // the two. That means a push can beat the read, in which case the read is
    // the older of the two and gets dropped.
    let pushed = false;
    try {
      const unsubscribe = await subscribeZones(hass, deviceId, (config) => {
        if (disposed) return;
        pushed = true;
        handlers.onConfig(config);
      });
      if (disposed) {
        // Disposed while the subscribe was in flight: the teardown already ran
        // and found nothing to close, so this one is ours to close.
        try {
          await unsubscribe();
        } catch {
          // Nothing left server side.
        }
        return;
      }
      unsubscribeZones = unsubscribe;
      const config = await fetchZones(hass, deviceId);
      retryIndex = 0;
      if (disposed || pushed) return;
      handlers.onConfig(config);
    } catch (error) {
      if (disposed) return;
      // Only "not loaded" is worth waiting out. A device that is not in the
      // registry will not appear because a card asked again.
      const willRetry =
        (error as any)?.code === ERR_NOT_LOADED && retryIndex < RETRY_DELAYS_MS.length;
      handlers.onError(describeError(error, deviceId, willRetry));
      if (willRetry) scheduleRetry();
    }
  };

  // One open at a time. Two overlapping opens (a reload's burst of entry
  // updates, or an update landing on top of a retry) both found nothing to
  // close, both subscribed, and the second handle overwrote the first, so the
  // orphan stayed open server side and every payload arrived twice.
  let queue: Promise<void> = Promise.resolve();
  const requestOpen = (): Promise<void> => {
    queue = queue.then(open);
    return queue;
  };

  const scheduleRetry = () => {
    if (disposed || retryIndex >= RETRY_DELAYS_MS.length) return;
    const delay = RETRY_DELAYS_MS[retryIndex];
    retryIndex += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void requestOpen();
    }, delay);
  };

  await requestOpen();

  const unsubscribeEntries = await subscribeEntryLoads(hass, () => {
    if (disposed) return;
    void requestOpen();
  });

  return async () => {
    disposed = true;
    cancelRetry();
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
