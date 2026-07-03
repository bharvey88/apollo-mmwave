/**
 * Polyfill-aware custom element registration.
 *
 * HA's frontend loads @webcomponents/scoped-custom-element-registry inside
 * the async app bundle. That polyfill's `get()`/`whenDefined()` only consult
 * its OWN definition map — anything defined on the native registry before the
 * polyfill executes becomes invisible to Lovelace's strategy/card lookups.
 *
 * Our bundle is injected as an extra module in the index, so it races the app
 * bundle: with a warm cache (service worker on https) the polyfill wins and
 * everything works; on a cold cache (plain-http origins have no service
 * worker) we win, register invisibly, and the dashboard times out waiting for
 * `ll-strategy-dashboard-apollo-radar-tuning` — on every load, hard refresh
 * included, because the module cache keeps the poisoned execution.
 *
 * Fix: define immediately (covers non-HA/test contexts), then re-assert every
 * definition once the HA app has booted. `home-assistant` (app) / `hc-main`
 * (cast receiver) are defined after the polyfill installs, and the polyfill
 * registers native stand-ins for its definitions, so the NATIVE `whenDefined`
 * we may hold pre-takeover still resolves. At that point `window.customElements`
 * is the final registry; anything it can't see gets defined again through it
 * (the polyfill accepts the same class + tag — its own map has no entry).
 */

type ElementCtor = CustomElementConstructor;

const pending = new Map<string, ElementCtor>();
let reassertHooked = false;

function safeDefine(tag: string, ctor: ElementCtor): void {
  try {
    // Always read window.customElements fresh — the polyfill replaces it.
    if (!window.customElements.get(tag)) {
      window.customElements.define(tag, ctor);
    }
  } catch {
    // Already defined on this registry (racing double-load): nothing to do.
  }
}

function reassertAll(): void {
  for (const [tag, ctor] of pending) safeDefine(tag, ctor);
}

/** Define now and re-assert after the HA app (and its registry polyfill)
 *  has booted. */
export function registerElement(tag: string, ctor: ElementCtor): void {
  pending.set(tag, ctor);
  safeDefine(tag, ctor);

  if (reassertHooked) return;
  reassertHooked = true;
  for (const marker of ["home-assistant", "hc-main"]) {
    // Resolves via the native registry pre-takeover too: the polyfill defines
    // native stand-ins, so this fires exactly when the app defines the marker.
    window.customElements.whenDefined(marker).then(reassertAll, () => undefined);
  }
}
