/**
 * happy-dom implements <canvas> as an element but has no 2D rendering context,
 * so getContext('2d') returns null and every draw path in the zone card throws.
 * Give it a context that swallows everything: each property read hands back a
 * callable that returns the same proxy, so chained calls and property reads
 * (ctx.measureText(t).width) resolve instead of blowing up, and nothing is
 * actually rasterised.
 *
 * This is a harness, not a canvas. Assert on card state, never on pixels.
 */

const noopContext: unknown = new Proxy(function () {} as object, {
  get(_target, prop) {
    // Let a stringified context stay printable in failure output.
    if (prop === Symbol.toPrimitive || prop === "toString") {
      return () => "[stub CanvasRenderingContext2D]";
    }
    return noopContext;
  },
  set() {
    return true;
  },
  apply() {
    return noopContext;
  },
});

// getContext is an overload set across every context type, so the stub cannot
// structurally satisfy it; it only ever gets called with '2d' here.
HTMLCanvasElement.prototype.getContext = function getContext() {
  return noopContext;
} as unknown as typeof HTMLCanvasElement.prototype.getContext;
