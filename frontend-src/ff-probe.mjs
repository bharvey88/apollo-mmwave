import { firefox } from "playwright";

const browser = await firefox.launch();
const page = await browser.newPage();
const consoleLines = [];
page.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));

// Same-origin page that doesn't need auth.
await page.goto("http://homeassistant.local:8123/auth/authorize?client_id=probe", {
  waitUntil: "domcontentloaded",
});

const result = await page.evaluate(async () => {
  const out = {};
  try {
    await import("/apollo_mmwave/apollo-radar-tuning.js?v=1.2.0");
    out.importError = null;
  } catch (e) {
    out.importError = String((e && (e.stack || e.message)) || e);
  }
  out.strategy = !!customElements.get("ll-strategy-dashboard-apollo-radar-tuning");
  out.card = !!customElements.get("apollo-radar-distance-card");
  try {
    await import("/apollo_mmwave/zone-mapper-card.js?v=1.2.0");
  } catch (e) {
    out.zoneImportError = String(e);
  }
  out.zoneCard = !!customElements.get("zone-mapper-card");
  return out;
});

console.log(JSON.stringify(result, null, 1));
console.log("--- console during import ---");
for (const l of consoleLines) console.log(l);
await browser.close();
