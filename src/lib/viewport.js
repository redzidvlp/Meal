/**
 * Keeps the app a single, fixed-width screen on a phone.
 *
 * The meta viewport already asks for no scaling, but iOS Safari ignores
 * `user-scalable=no` for accessibility and still lets two fingers zoom — which
 * also lets the page be dragged sideways afterwards. These listeners close that
 * gap. Pinch on a laptop trackpad is left alone: it is only touch we block.
 */
export function lockViewport() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  if (window.__viewportLocked) return () => {};
  window.__viewportLocked = true;

  const blockGesture = event => event.preventDefault();

  const blockPinch = event => {
    if (event.touches && event.touches.length > 1) event.preventDefault();
  };

  // Double-tap zoom (Safari answers "gesture*" instead of "touch*").
  document.addEventListener("gesturestart", blockGesture, { passive: false });
  document.addEventListener("gesturechange", blockGesture, { passive: false });
  document.addEventListener("gestureend", blockGesture, { passive: false });
  document.addEventListener("touchmove", blockPinch, { passive: false });

  return () => {
    window.__viewportLocked = false;
    document.removeEventListener("gesturestart", blockGesture);
    document.removeEventListener("gesturechange", blockGesture);
    document.removeEventListener("gestureend", blockGesture);
    document.removeEventListener("touchmove", blockPinch);
  };
}
