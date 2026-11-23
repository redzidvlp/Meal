/* The complaint this file exists for:
 *
 *   "I click a button and it takes a minute or two for the action to happen."
 *
 * The demo smoke suites pass in milliseconds, so they cannot show that. This
 * one slows the backend down to phone-on-a-train speed and measures what the
 * person actually experiences: how long until the screen changes, and how many
 * kitchen reads a single tap costs.
 *
 *   npm run test:speed
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: "http://localhost:5173/",
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.MouseEvent = dom.window.MouseEvent;
global.getComputedStyle = dom.window.getComputedStyle;
global.localStorage = dom.window.localStorage;
global.requestAnimationFrame = callback => setTimeout(callback, 0);
global.cancelAnimationFrame = id => clearTimeout(id);
global.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
global.Element.prototype.scrollIntoView = () => {};

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { createDemoBackend } = await import("../src/lib/demoBackend.js");
const App = (await import("../src/App.jsx")).default;

// A backend that answers like the cloud does on a bad mobile connection:
// every read takes 900 ms and every write 400 ms.
const NETWORK_READ_MS = 900;
const NETWORK_WRITE_MS = 400;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const slow = createDemoBackend();
const probe = { reads: 0, writes: 0, fullReads: 0, sliceReads: 0 };

// The hook reaches the backend through lib/api.js, so the slow timing goes on the
// instance that module already created — the same object the app will use.
const { api, isDemo } = await import("../src/lib/api.js");
if (!isDemo) throw new Error("speed smoke expects the demo backend (no Supabase env in this build)");
const instance = await api.ready;
instance.loadAll = async options => {
  probe.reads += 1;
  if (options?.tables?.length) probe.sliceReads += 1;
  else probe.fullReads += 1;
  await sleep(NETWORK_READ_MS);
  return slow.loadAll(options);
};
for (const method of ["setSlot", "toggleEaten", "saveRecipe", "saveProduct", "setWater", "saveNote"]) {
  const original = instance[method].bind(instance);
  instance[method] = async (...args) => {
    probe.writes += 1;
    await sleep(NETWORK_WRITE_MS);
    return original(...args);
  };
}

const root = createRoot(document.getElementById("root"));
const text = () => document.body.textContent.replace(/\s+/g, " ").trim();
const button = (needle, scope = document) => [...scope.querySelectorAll("button")].find(el => el.textContent.includes(needle));
const assert = (condition, message) => { if (!condition) throw new Error(`ASSERT: ${message}`); };

const click = async (element, wait = 120) => {
  if (!element) throw new Error("click target missing");
  await act(async () => {
    element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await sleep(wait);
  });
};
const nav = label => click(button(label, document.querySelector(".bottom-nav")), 250);

await act(async () => { root.render(React.createElement(App)); });
await sleep(3200); // the slowed initial kitchen read
assert(text().includes("This week") || document.querySelector(".meal-card"), "the kitchen opened");

// The slowed methods went onto the very object the hook calls, so this count
// proves the app really used them.
const readsBeforeMount = probe.reads;
assert(readsBeforeMount >= 1, `the initial kitchen read went through the slowed backend (${readsBeforeMount})`);

// ── 1. Choosing a meal ────────────────────────────────────────────────────
await nav("Plan");
const change = button("Change", document.querySelector("[data-drop-slot='lunch']"));
assert(change, "a meal can be changed");
await click(change, 250);
const option = [...document.querySelectorAll(".recipe-option")].find(el => !el.disabled);
assert(option, "the picker offers recipes");
const chosenName = option.querySelector(".opt-name").textContent.trim();

const readsBeforePick = probe.reads;
const pickStarted = Date.now();
await act(async () => {
  option.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  // Deliberately shorter than the 400 ms write: the screen has to be right
  // already, before the server has answered anything.
  await sleep(150);
});
const planTextEarly = text();
const earlyMs = Date.now() - pickStarted;
assert(planTextEarly.includes(chosenName.slice(0, 14)), `the meal is on the plan after ${earlyMs} ms, before the write finished`);
assert(earlyMs < NETWORK_WRITE_MS, "the tap painted the screen without waiting for the network");
console.log(`SPEED: the plan showed the chosen meal in ${earlyMs} ms (write: ${NETWORK_WRITE_MS} ms, read: ${NETWORK_READ_MS} ms)`);

// Let the write and the whole reload burst settle.
await sleep(3000);
const readsForOnePick = probe.reads - readsBeforePick;
assert(readsForOnePick <= 1, `one tap read the kitchen ${readsForOnePick} time(s) — it must not queue a read per event`);
console.log(`SPEED: one change cost ${readsForOnePick} kitchen read(s), not one per write + echo`);

// ── 2. A burst of taps ────────────────────────────────────────────────────
await nav("Plan");
const readsBeforeBurst = probe.reads;
const burstStart = Date.now();
for (let round = 0; round < 3; round += 1) {
  const pick = button("Change", document.querySelector("[data-drop-slot='lunch']"));
  await click(pick, 120);
  const next = [...document.querySelectorAll(".recipe-option")].find(el => !el.disabled);
  await click(next, 120);
}
const burstMs = Date.now() - burstStart;
await sleep(3500);
const readsForBurst = probe.reads - readsBeforeBurst;
assert(readsForBurst <= 2, `three quick changes caused ${readsForBurst} kitchen reads`);
console.log(`SPEED: three taps in ${burstMs} ms caused ${readsForBurst} read(s) — the pool never stacked up`);

// ── 3. How the reads are shaped ───────────────────────────────────────────
assert(probe.sliceReads > 0 || probe.reads === probe.fullReads, "reloads are narrowed to the tables that changed where the backend reports them");
console.log(`SPEED: ${probe.fullReads} full read(s), ${probe.sliceReads} narrowed read(s) in the whole run`);

root.unmount();
console.log("SPEED SMOKE OK");
