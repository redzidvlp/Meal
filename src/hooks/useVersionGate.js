import { useEffect, useState } from "react";
import { currentBuildId, readStoredBuild, writeBuild, takePendingUpdate } from "../lib/build.js";

/**
 * Covers the case the service worker cannot: a cold start where the browser
 * already handed the phone the new build (a waiting worker activates once the
 * last tab closes). The plan, pantry and shopping list are already saved, but
 * the person still gets an explicit "open the new version" button before the
 * kitchen is shown, instead of the interface changing without a word.
 */
export function useVersionGate(enabled) {
  const [pending, setPending] = useState(false);
  const build = currentBuildId();

  useEffect(() => {
    if (!enabled || !build) return;
    if (takePendingUpdate()) {
      // The service-worker gate already asked; do not ask twice in a row.
      writeBuild(build);
      return;
    }
    const previous = readStoredBuild();
    if (previous && previous !== build) setPending(true);
    else writeBuild(build);
  }, [enabled, build]);

  return {
    pending: pending && enabled,
    build,
    accept: () => {
      writeBuild(build);
      setPending(false);
    },
    later: () => setPending(false),
  };
}
