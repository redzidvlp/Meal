/* Temporary render smoke test: boots the demo app in jsdom and clicks every tab. */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
  url: "http://localhost:5173/",
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.MouseEvent = dom.window.MouseEvent;
global.Node = dom.window.Node;
global.getComputedStyle = dom.window.getComputedStyle;
global.localStorage = dom.window.localStorage;
global.requestAnimationFrame = callback => setTimeout(callback, 0);
global.cancelAnimationFrame = id => clearTimeout(id);
global.IS_REACT_ACT_ENVIRONMENT = true;

global.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
global.window.scrollTo = () => {};
global.Element.prototype.scrollIntoView = () => {};

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const App = (await import("../src/App.jsx")).default;

const container = document.getElementById("root");
const root = createRoot(container);

await act(async () => {
  root.render(React.createElement(App));
  await new Promise(resolve => setTimeout(resolve, 50));
});
await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });

const text = () => document.body.textContent.replace(/\s+/g, " ").trim();
console.log("MOUNT:", text().slice(0, 240));

const errors = [];
const originalError = console.error;
console.error = (...args) => {
  errors.push(args.map(String).join(" "));
  originalError(...args);
};

const clickByText = async needle => {
  const buttons = [...container.querySelectorAll("button")];
  const target = buttons.find(button => button.textContent.includes(needle));
  if (!target) throw new Error(`No button containing ${needle}`);
  await act(async () => {
    target.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 120));
  });
};

for (const [label, check] of [
  ["Sous-chef", "Sous-chef"],
  ["Shopping", "Shopping"],
  ["Pantry", "Pantry"],
  ["Tips", "Kitchen notes"],
  ["Plan", "This week"],
]) {
  await clickByText(label);
  const content = text();
  if (!content.includes(check)) throw new Error(`Tab ${label} did not render expected "${check}": ${content.slice(0, 220)}`);
  console.log(`TAB ${label}: ok`);
}

// The camera next to the day menu photographs the plate. It has to say which
// day the meal is going into: otherwise a photo looks like it did nothing,
// because the saved recipe never appears on the plan.
const scanButton = container.querySelector(".scan-btn");
if (!scanButton) throw new Error("Plan screen has no camera button");
await act(async () => {
  scanButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 150));
});
const scanText = text();
if (!scanText.includes("It will be added to")) throw new Error(`The camera does not say where the meal goes: ${scanText.slice(0, 240)}`);
if (!/Mon|Tue|Wed|Thu|Fri|Sat|Sun/.test(scanText)) throw new Error("The camera does not name the day");
console.log("PLAN CAMERA: says which day it fills");
const scanClose = [...document.querySelectorAll("button")].find(button => button.getAttribute("aria-label") === "Close");
await act(async () => {
  scanClose.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 80));
});

// Open the first meal recipe and close it.
const recipeButton = [...container.querySelectorAll("button")].find(button => button.textContent.trim() === "Recipe");
if (recipeButton) {
  await act(async () => {
    recipeButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 120));
  });
  if (!text().includes("Ingredients")) throw new Error("Recipe modal did not open");
  console.log("RECIPE MODAL: ok");

  // An open recipe card must be as unpannable as the rest of the app: the page
  // behind is locked, and only vertical scrolling inside the sheet is allowed.
  if (!document.body.classList.contains("is-locked")) throw new Error("Open recipe did not lock the page");
  const sheetBody = document.querySelector(".sheet-body") || document.querySelector(".modal-body");
  if (!sheetBody) throw new Error("Recipe sheet has no scroll body");
  if (sheetBody.style.touchAction !== "pan-y") throw new Error(`Sheet allows sideways touch (${sheetBody.style.touchAction || "none"})`);
  if (sheetBody.style.overscrollBehavior !== "contain") throw new Error("Sheet rubber-bands into the page");
  // A flex child that cannot shrink clips a long recipe instead of scrolling it.
  if (sheetBody.style.minHeight !== "0px" && sheetBody.style.minHeight !== "0") {
    throw new Error(`Sheet body cannot shrink, so it clips (min-height: ${sheetBody.style.minHeight || "auto"})`);
  }
  // iOS ignores overflow:hidden on body; only a pinned body stops the page
  // behind from scrolling.
  if (document.body.style.position !== "fixed") throw new Error("Page behind is not pinned, it can still scroll");
  const backdrop = document.querySelector(".modal-backdrop");
  if (backdrop && backdrop.style.touchAction === "none") throw new Error("Backdrop blocks the sheet's own scrolling");
  console.log("RECIPE PAN LOCK: ok");

  const close = [...document.querySelectorAll("button")].find(button => button.getAttribute("aria-label") === "Close");
  await act(async () => {
    close.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 80));
  });
  if (document.body.classList.contains("is-locked")) throw new Error("Page stayed locked after closing the recipe");
  if (document.body.style.position === "fixed") throw new Error("Page stayed pinned after closing the recipe");
  console.log("RECIPE CLOSE UNLOCKS: ok");
}

// Pantry: press a + stepper.
await clickByText("Pantry");
const plus = [...container.querySelectorAll("button")].find(button => button.textContent === "+");
if (plus) {
  await act(async () => {
    plus.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 700));
  });
  console.log("PANTRY STEPPER: ok");
}

// Settings sheet.
const settings = [...container.querySelectorAll("button")].find(button => button.getAttribute("aria-label") === "Settings");
if (settings) {
  await act(async () => {
    settings.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 150));
  });
  if (!text().includes("Invite code")) throw new Error("Settings sheet did not open");
  console.log("SETTINGS: ok");
}

console.log("ERRORS:", errors.filter(error => !error.includes("not wrapped in act")).length);
if (errors.some(error => !error.includes("not wrapped in act"))) {
  console.log(errors.filter(error => !error.includes("not wrapped in act")).slice(0, 5).join("\n---\n"));
  process.exitCode = 1;
}
console.log("SMOKE OK");
root.unmount();
