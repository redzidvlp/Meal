/**
 * One shared, trailing reload for the whole kitchen.
 *
 * Every write and every realtime event used to ask for a full kitchen reload,
 * and each request ran all thirteen queries. One tap on a phone therefore
 * produced three or four of them, one after another — which is why a button
 * could take a minute to "do" something.
 *
 * This turns any number of requests into one read:
 *   • the first request opens a short window (`wait` ms);
 *   • anything asked for inside that window rides along with it;
 *   • requests can pull the run earlier, never later, so a burst is bounded;
 *   • only one run is ever on the wire, and anything asked for while it runs
 *     becomes exactly one follow-up.
 */

const noop = () => {};

export function createReloader(run, options = {}) {
  const wait = Math.max(0, Number(options.wait ?? 250));
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const setTimer = typeof options.setTimer === "function" ? options.setTimer : (fn, ms) => setTimeout(fn, ms);
  const clearTimer = typeof options.clearTimer === "function" ? options.clearTimer : id => clearTimeout(id);

  let timer = null;
  let timerAt = 0;
  let running = false;
  let dirty = false;
  let disposed = false;
  let current = Promise.resolve();

  function fire() {
    timer = null;
    timerAt = 0;
    if (disposed) return;
    if (running) {
      dirty = true;
      return;
    }
    start();
  }

  function start() {
    if (disposed) return current;
    running = true;
    const job = Promise.resolve()
      .then(() => run())
      .catch(noop)
      .then(() => {
        running = false;
        if (dirty && !disposed) {
          dirty = false;
          schedule(wait);
        }
      });
    current = job;
    return job;
  }

  function schedule(delay) {
    const ms = Math.max(0, Number(delay) || 0);
    const at = now() + ms;
    if (timer) {
      // Never postpone a run that is already waiting: a burst of realtime
      // events must not keep pushing the reload into the future.
      if (at < timerAt - 1) {
        clearTimer(timer);
        timerAt = at;
        timer = setTimer(fire, Math.max(0, timerAt - now()));
      }
      return;
    }
    timerAt = at;
    timer = setTimer(fire, ms);
  }

  /** Ask for a reload. `delay` defaults to the short shared window. */
  function request(delay = wait) {
    if (disposed) return;
    if (running) {
      dirty = true;
      return;
    }
    schedule(delay);
  }

  /** Run now, sharing whatever may already be on the wire. */
  async function flush() {
    if (disposed) return;
    if (timer) {
      clearTimer(timer);
      timer = null;
      timerAt = 0;
    }
    while (running) {
      dirty = true;
      await current;
    }
    if (timer) {
      clearTimer(timer);
      timer = null;
      timerAt = 0;
    }
    dirty = false;
    await start();
  }

  /** Drop anything waiting (leaving the screen, switching household). */
  function cancel() {
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
    timerAt = 0;
    dirty = false;
  }

  return {
    request,
    flush,
    cancel,
    get pending() {
      return !!(timer || running || dirty);
    },
  };
}


/**
 * Collects which tables a batch of reloads is about.
 *
 * Any number of narrow requests merge into one read of those tables. A request
 * that does not say which table moved — another tab wrote, an older backend —
 * must widen the read to everything, and it must stay widened even if narrow
 * requests arrive after it.
 */
export function createTableBatch() {
  let tables = new Set();
  let full = false;
  return {
    add(list) {
      if (!Array.isArray(list)) {
        full = true;
        tables = new Set();
        return;
      }
      if (full) return;
      for (const table of list) if (table) tables.add(table);
    },
    /** Returns the tables to read, or null for a full kitchen read. */
    take() {
      const result = full || tables.size === 0 ? null : [...tables];
      tables = new Set();
      full = false;
      return result;
    },
    reset() {
      tables = new Set();
      full = false;
    },
    get pending() {
      return full || tables.size > 0;
    },
  };
}
