import { useEffect, useRef, useState } from "react";

/**
 * Registers the service worker in "prompt" mode so a new deployment shows a
 * banner instead of silently swapping under the user. The registration is
 * checked again on a timer and whenever the app returns to the foreground.
 */
export function usePwaUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateRef = useRef(null);
  const registrationRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return undefined;

    let cancelled = false;
    let timer = null;

    import("virtual:pwa-register")
      .then(({ registerSW }) => {
        if (cancelled) return;
        updateRef.current = registerSW({
          immediate: true,
          onNeedRefresh() {
            setNeedRefresh(true);
          },
          onRegisteredSW(_url, registration) {
            registrationRef.current = registration;
            if (!registration) return;
            timer = setInterval(() => {
              registration.update?.().catch(() => {});
            }, 30 * 60 * 1000);
          },
        });
      })
      .catch(() => {
        // Registration is a progressive enhancement; the app still works.
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        registrationRef.current?.update?.().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return {
    needRefresh,
    updateNow: () => {
      setNeedRefresh(false);
      updateRef.current?.(true);
    },
    dismiss: () => setNeedRefresh(false),
  };
}
