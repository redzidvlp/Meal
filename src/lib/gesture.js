/**
 * Swipe-to-close maths for the bottom sheets.
 *
 * The grabber on a sheet has always looked grabbable, but nothing listened to
 * it: on a phone the only ways out were the ✕, the Close button or a tap on the
 * backdrop. These helpers turn a real downward drag into "close it" or "put it
 * back", and are kept apart from the component so they can be tested without a
 * browser.
 */

/** A few pixels of finger wobble before a drag is allowed to start. */
export const DRAG_SLOP = 6;

/**
 * Should a drag that was just released close the sheet?
 *
 * Two ways to mean it: drag far enough (a fifth of the sheet, at most 150 px so
 * a tall sheet does not need an arm-length swipe), or flick it — a short, fast
 * flick is a close even though it did not travel far. A slow, short drag is not.
 *
 * @param {{ y: number, velocity?: number, height?: number }} input
 *   `y` is how far the sheet was pulled down in px, `velocity` in px/ms.
 */
export function dismissOnRelease({ y = 0, velocity = 0, height = 520 } = {}) {
  if (!(y > 0)) return false;
  const distance = Math.min(Math.max(height, 0) * 0.22, 150);
  if (y > distance) return true;
  return velocity > 0.55 && y > 28;
}
