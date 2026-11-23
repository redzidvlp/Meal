import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, isDemo, isCloudConfigured, backendMode, backendHost } from "../lib/api.js";
import { projectHost } from "../lib/errors.js";
import { buildPlan } from "../engine/plan.js";
import { buildShoppingList } from "../engine/shopping.js";
import { lowItems } from "../engine/pantry.js";
import { mergeMenus } from "../lib/menus.js";
import { createReloader, createTableBatch } from "../lib/reload.js";
import { poolRecipes, removalRow, restorableRecipe } from "../lib/library.js";
import {
  applySlot as optimisticSlot,
  applyMenu as optimisticMenu,
  applyMove as optimisticMove,
  applySectionHidden as optimisticSection,
  applyEaten as optimisticEaten,
  applyResetWeek as optimisticReset,
} from "../lib/optimistic.js";
import { PRESET_MENUS } from "../data/presets.js";
import { mondayISO } from "../lib/format.js";
import { requestRecipeIdea } from "../lib/ideas.js";
import { productFact } from "../lib/products.js";
import { registerProductFacts } from "../data/ingredientFacts.js";

// A load that never settles is worse than a failed one: the spinner turns
// forever on a bad mobile connection. Every network read gets a deadline.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(Object.assign(new Error(`${label}_timeout`), { kind: "network", table: label }));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const EMPTY = {
  household: null,
  profiles: [],
  recipes: [],
  assignments: [],
  eaten: [],
  water: [],
  notes: [],
  shoppingChecks: [],
  menus: [],
  pantry: [],
  labels: [],
  products: [],
  hiddenSections: [],
  removed: [],
};

/**
 * On a failed write, put back only the rows that write could have changed —
 * never the whole kitchen, because the partner may have changed something else
 * while it was in flight.
 */
const ROLLBACK_KEYS = ["household", "eaten", "assignments", "pantry", "notes", "water", "shoppingChecks", "hiddenSections", "menus", "profiles", "recipes", "labels", "products", "removed"];

function rollbackRows(before, current) {
  const patch = {};
  for (const key of ROLLBACK_KEYS) {
    if (JSON.stringify(before[key]) === JSON.stringify(current[key])) continue;
    patch[key] = before[key];
  }
  return patch;
}

export function useAppData(t = {}) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [data, setData] = useState(EMPTY);
  // Used to roll a failed optimistic write back without reloading everything.
  const householdRef = useRef(null);
  householdRef.current = data.household;
  const dataRef = useRef(data);
  dataRef.current = data;
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [profileNonce, setProfileNonce] = useState(0);
  const [profileChecked, setProfileChecked] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataReady, setDataReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [dataIssues, setDataIssues] = useState([]);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const profileRef = useRef(null);
  profileRef.current = profile;

  const notify = useCallback((message, type = "info") => {
    setToast({ message, type, id: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const applyProfile = useCallback(nextProfile => {
    setProfile(nextProfile);
    api.setContext?.({
      userId: nextProfile?.id || null,
      householdId: nextProfile?.householdId || null,
      personKey: nextProfile?.personKey || "R",
    });
  }, []);

  useEffect(() => {
    let active = true;
    withTimeout(Promise.resolve(api.getSession()), 12000, "session")
      .then(nextSession => {
        if (!active) return;
        setSession(nextSession);
        setAuthLoading(false);
      })
      .catch(() => {
        if (active) setAuthLoading(false);
      });
    const unsubscribe = api.onAuthChange(nextSession => {
      if (!active) return;
      setSession(nextSession);
      setAuthLoading(false);
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const userId = session?.user?.id || null;

  useEffect(() => {
    let active = true;
    if (!userId) {
      applyProfile(null);
      setData(EMPTY);
      setProfileChecked(true);
      setDataReady(false);
      return () => { active = false; };
    }
    api.setContext?.({ userId });
    setProfileLoading(true);
    setProfileChecked(false);
    setDataReady(false);
    withTimeout(Promise.resolve(api.getProfile()), 15000, "profiles")
      .then(nextProfile => {
        if (!active) return;
        applyProfile(nextProfile);
        setProfileError(null);
        setProfileLoading(false);
        setProfileChecked(true);
      })
      .catch(error => {
        if (!active) return;
        console.error(error);
        // Do not drop to "set up your kitchen" when the profile could not be
        // read — that would look like the household was lost.
        setProfileError(error);
        setProfileLoading(false);
        setProfileChecked(true);
        notify(t.loadingError || "Could not load your profile.", "error");
      });
    return () => { active = false; };
    // Depend on the user id, not the session object: token refreshes must not
    // send the app back through the loading gate.
  }, [userId, profileNonce, applyProfile, notify]);

  const loadAll = useCallback(async ({ silent = false, retried = false, tables = null } = {}) => {
    if (!profileRef.current?.householdId) return;
    if (!silent) setDataLoading(true);
    try {
      const next = await withTimeout(Promise.resolve(api.loadAll({ tables })), 20000, "kitchen");
      if (next) {
        if (Array.isArray(tables)) {
          // A slice: merge it over what is already on screen, so a pantry tick
          // never blanks the plan while it lands.
          const patch = { ...next };
          delete patch.issues;
          setData(previous => ({ ...previous, ...patch }));
        } else {
          setData({ ...EMPTY, ...next });
        }
        if (!Array.isArray(tables)) setDataIssues(Array.isArray(next.issues) ? next.issues : []);
        else if (next.issues?.length) setDataIssues(previous => [
          ...previous.filter(issue => !next.issues.some(fresh => fresh.table === issue.table && fresh.kind === issue.kind)),
          ...next.issues,
        ]);
        setLoadError(null);
      }
    } catch (error) {
      // A stale access token is the most common cause of a blank kitchen. Refresh
      // the session once and try again before showing anything to the user.
      if (!retried && (error?.kind === "auth" || String(error?.message || "").match(/jwt|token/i))) {
        try {
          await api.refreshSession?.();
          setDataLoading(false);
          return loadAll({ silent, retried: true, tables });
        } catch {
          // falls through to the error screen below
        }
      }
      console.error(error);
      setLoadError(error);
      if (!silent) notify(t.loadingError || "Could not load your kitchen.", "error");
    } finally {
      setDataLoading(false);
      setDataReady(true);
    }
  }, [notify, t.loadingError]);

  useEffect(() => {
    if (!profile?.householdId) return undefined;
    setDataReady(false);
    loadAll();
    return undefined;
  }, [profile?.householdId, loadAll]);

  const reloadRef = useRef(loadAll);
  reloadRef.current = loadAll;

  // ── One reload at a time ───────────────────────────────────────────────────
  // Every write and every realtime event used to ask for its own full kitchen
  // read: one tap could queue three of them, each thirteen queries. They now
  // share a single trailing read, and a reload that arrives while one is on the
  // wire becomes exactly one follow-up instead of a queue.
  const reloaderRef = useRef(null);
  if (!reloaderRef.current) {
    const batch = createTableBatch();
    const reloader = createReloader(async () => {
      // take() must happen when the read starts, not when it was asked for, so
      // everything that arrived in the window is included exactly once.
      await reloadRef.current({ silent: true, tables: batch.take() });
    }, { wait: 250 });
    reloaderRef.current = {
      request(delay = 250, tables = null) {
        batch.add(tables);
        reloader.request(delay);
      },
      flush: reloader.flush,
      cancel: () => {
        batch.reset();
        reloader.cancel();
      },
    };
  }

  /** Ask for a reload; `tables` narrows it to the tables that actually moved. */
  const scheduleReload = useCallback((tables = null) => {
    const wanted = Array.isArray(tables) ? tables.filter(Boolean) : null;
    // One table that just changed does not need half a second of patience.
    const delay = wanted && wanted.length <= 2 ? 120 : 250;
    reloaderRef.current?.request(delay, wanted);
  }, []);

  useEffect(() => {
    if (!profile?.householdId) return undefined;
    reloaderRef.current?.cancel();
    // The backend hands over the set of tables that changed, so one pantry
    // tick reads the pantry and not the whole kitchen.
    const unsubscribe = api.subscribe(tables => {
      const rows = tables && tables.size ? [...tables] : null;
      scheduleReload(rows);
    });
    return () => {
      unsubscribe?.();
      reloaderRef.current?.cancel();
    };
  }, [profile?.householdId, scheduleReload]);

  const refresh = useCallback(() => loadAll({ silent: true }), [loadAll]);

  // A slice reload for tables the realtime channel does not filter by household
  // (library recipes) or whose shape is better read back than guessed.
  const refreshTables = useCallback(tables => loadAll({ silent: true, tables }), [loadAll]);

  // Used by the connection screen: re-read the profile and the kitchen instead
  // of leaving the person on a dead-end page.
  const retryConnection = useCallback(() => {
    setProfileError(null);
    setProfileChecked(false);
    setProfileNonce(value => value + 1);
    if (profileRef.current?.householdId) loadAll({ retried: true });
  }, [loadAll]);

  const signIn = useCallback(async (email, password) => {
    await api.signIn(email, password);
  }, []);

  const signUp = useCallback(async (email, password) => {
    return api.signUp(email, password);
  }, []);

  const signOut = useCallback(async () => {
    await api.signOut();
    applyProfile(null);
    setData(EMPTY);
    setSession(null);
  }, [applyProfile]);

  const createHousehold = useCallback(async (name, personName, personKey) => {
    const result = await api.createHousehold(name, personName, personKey);
    const nextProfile = await api.getProfile();
    applyProfile(nextProfile);
    return result;
  }, [applyProfile]);

  const joinHousehold = useCallback(async (code, personName, personKey) => {
    await api.joinHousehold(code, personName, personKey);
    const nextProfile = await api.getProfile();
    applyProfile(nextProfile);
    return nextProfile;
  }, [applyProfile]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const recipesById = useMemo(
    () => new Map(data.recipes.map(recipe => [recipe.id, recipe])),
    [data.recipes],
  );

  // What this kitchen still wants offered. Removed dishes stay out of the
  // picker, the sous-chef and every new plan, but the shared library row and
  // the old week are untouched.
  const pool = useMemo(() => poolRecipes(data.recipes, data.removed), [data.recipes, data.removed]);
  const poolById = useMemo(() => new Map(pool.map(recipe => [recipe.id, recipe])), [pool]);

  const plan = useMemo(
    () => buildPlan(data.assignments, poolById),
    [data.assignments, poolById],
  );

  const notesMap = useMemo(() => {
    const map = {};
    for (const row of data.notes) map[`${row.recipeId}:${row.personKey}`] = row.note;
    return map;
  }, [data.notes]);

  const eatenMap = useMemo(() => {
    const map = {};
    for (const row of data.eaten) {
      if (row.eaten) map[`${row.day}:${row.slot}:${row.personKey}`] = true;
    }
    return map;
  }, [data.eaten]);

  const waterMap = useMemo(() => {
    const map = {};
    for (const row of data.water) map[`${row.day}:${row.personKey}`] = row.ml;
    return map;
  }, [data.water]);

  const weekStart = mondayISO();
  const checksMap = useMemo(() => {
    const map = {};
    for (const row of data.shoppingChecks) {
      if (row.weekStart === weekStart && row.checked) map[row.itemKey] = true;
    }
    return map;
  }, [data.shoppingChecks, weekStart]);

  const people = useMemo(() => {
    const map = {};
    for (const person of data.profiles) map[person.personKey] = person.displayName;
    return map;
  }, [data.profiles]);

  const extraPortions = Number(data.household?.extraPortions) || 0;

  const shoppingList = useCallback((days, lang) => buildShoppingList({
    plan,
    days,
    extraPortions,
    lang,
    pantry: data.pantry,
  }), [plan, extraPortions, data.pantry]);

  const lowPantry = useMemo(() => lowItems(data.pantry), [data.pantry]);

  const menus = useMemo(() => mergeMenus(PRESET_MENUS, data.menus), [data.menus]);

  const hiddenMap = useMemo(() => {
    const map = {};
    for (const row of data.hiddenSections) map[`${row.day}:${row.slot}`] = true;
    return map;
  }, [data.hiddenSections]);

  const sectionHidden = useCallback((day, slot) => !!hiddenMap[`${day}:${slot}`], [hiddenMap]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const describeFailure = useCallback(error => {
    console.error(error);
    const message = error?.message?.toLowerCase() || "";
    if (message.includes("invalid_code")) notify(t.invalidCode || "That invite code was not found.", "error");
    else if (message.includes("person_taken")) notify(t.personTaken || "That person slot is already taken.", "error");
    else if (message.includes("already_linked")) notify(t.alreadyLinked || "This account is already linked to a kitchen.", "error");
    else notify(error?.userMessage || t.savingFailed || "Could not save. Check your connection and try again.", "error");
  }, [notify, t]);

  /**
   * The tap paints first, the write follows.
   *
   * Old shape: await the write, then reload all thirteen tables, then let the
   * screen change. On a phone that was the whole complaint — a button that
   * "takes a minute". New shape: `optimistic(data)` produces the new screen at
   * once, the write runs in the background, and only a failure puts the old
   * rows back. The realtime channel reconciles afterwards on its own.
   */
  const mutate = useCallback(async (optimistic, write, { successMessage = null, revertMessage = null, merge = null } = {}) => {
    const before = dataRef.current;
    let rollback = null;
    if (typeof optimistic === "function") {
      const next = optimistic(before);
      if (next && next !== before) {
        rollback = before;
        setData(next);
      }
    }
    try {
      const result = await write();
      // Some writes change what the screen is made of (a recipe's copy gets a
      // new id when a library recipe is forked; a pantry row is created). Fold
      // the server's answer in before anything has to be re-read.
      if (merge && result && typeof result === "object") setData(previous => merge(previous, result));
      if (successMessage) notify(successMessage);
      return result;
    } catch (error) {
      if (rollback) {
        // Put back exactly the rows this write touched, not the whole kitchen:
        // the partner may have changed something else in the meantime.
        setData(current => ({ ...current, ...rollbackRows(rollback, current) }));
      }
      describeFailure(error);
      if (revertMessage) notify(revertMessage, "error");
      throw error;
    }
  }, [notify, describeFailure]);

  /** The guarded shape for writes that cannot be predicted locally. */
  const guarded = useCallback(async (fn, successMessage = null) => {
    try {
      const result = await fn();
      if (successMessage) notify(successMessage);
      return result;
    } catch (error) {
      describeFailure(error);
      throw error;
    }
  }, [notify, describeFailure]);

  const setSlot = useCallback(async (day, slot, rows) => {
    // Only rows for recipes this device actually knows can be drawn; a null id
    // is the database's way of saying "leave this person's meal alone".
    const drawn = (rows || []).filter(row => row && row.recipeId);
    await mutate(
      state => optimisticSlot(state, day, slot, drawn),
      () => api.setSlot(day, slot, rows),
    );
  }, [mutate]);

  const setMeal = useCallback(async (day, slot, recipeId, mode = "both") => {
    const rows = mode === "split"
      ? [{ personKey: "R", recipeId }, { personKey: "I", recipeId }]
      : [{ personKey: "both", recipeId }];
    await setSlot(day, slot, rows);
  }, [setSlot]);

  // Turns a shared meal into two independent meals, seeded with the same recipe.
  const setSplit = useCallback(async (day, slot, recipe) => {
    await setSlot(day, slot, [
      { personKey: "R", recipeId: recipe?.id || null },
      { personKey: "I", recipeId: recipe?.id || null },
    ]);
  }, [setSlot]);

  const setSame = useCallback(async (day, slot, recipe) => {
    await setSlot(day, slot, [{ personKey: "both", recipeId: recipe?.id || null }]);
  }, [setSlot]);

  const clearSlot = useCallback(async (day, slot) => {
    await setSlot(day, slot, []);
  }, [setSlot]);

  const moveSlot = useCallback(async (day, fromSlot, toSlot) => {
    await mutate(
      state => optimisticMove(state, day, fromSlot, toSlot),
      () => api.moveSlot(day, fromSlot, toSlot),
    );
  }, [mutate]);

  const hideSection = useCallback(async (day, slot) => {
    await mutate(
      state => optimisticSection(state, day, slot, true),
      () => api.setSectionHidden(day, slot, true),
    );
  }, [mutate]);

  const showSection = useCallback(async (day, slot) => {
    await mutate(
      state => optimisticSection(state, day, slot, false),
      () => api.setSectionHidden(day, slot, false),
    );
  }, [mutate]);

  const generateIdea = useCallback(input => requestRecipeIdea({
    api,
    ...input,
    pantry: input?.pantry || data.pantry,
  }), [data.pantry]);

  const applyMenu = useCallback(async (day, menu) => {
    await mutate(
      state => optimisticMenu(state, day, menu),
      () => api.applyMenu(day, menu),
    );
  }, [mutate]);

  // The pantry drops under the finger; the RPC records exactly what left, and
  // the realtime echo replaces the local guess with the stored rows.
  const toggleEaten = useCallback(async (day, slot, personKey, recipe) => {
    if (!recipe) return;
    const factor = personKey === "both" ? 2 : 1;
    await mutate(
      state => optimisticEaten(state, { day, slot, personKey, recipe, factor }),
      () => api.toggleEaten({ day, slot, personKey, factor, recipeId: recipe.id }),
    );
  }, [mutate]);

  const setWater = useCallback((day, personKey, ml) => {
    setData(prev => {
      const water = prev.water.filter(row => !(row.day === day && row.personKey === personKey));
      water.push({ day, personKey, ml });
      return { ...prev, water };
    });
    api.setWater(day, personKey, ml).catch(error => {
      console.error(error);
      notify(t.savingFailed || "Could not save water.", "error");
    });
  }, [notify, t.savingFailed]);

  const saveMenu = useCallback(async input => {
    try {
      const saved = await api.saveMenu(input);
      scheduleReload(["menus"]);
      return saved;
    } catch (error) {
      console.error(error);
      if (error?.errors) throw error;
      notify(t.savingFailed || "Could not save the menu.", "error");
      throw error;
    }
  }, [scheduleReload, notify, t.savingFailed]);

  const deleteMenu = useCallback(async id => {
    await mutate(
      state => ({ ...state, menus: state.menus.filter(menu => menu.id !== id) }),
      () => api.deleteMenu(id),
      { successMessage: t.menuDeleted || "Menu deleted" },
    );
    scheduleReload(["menus"]);
  }, [mutate, scheduleReload, t.menuDeleted]);

  const resetMenu = useCallback(async presetKey => {
    await mutate(
      state => ({ ...state, menus: state.menus.filter(menu => menu.presetKey !== presetKey) }),
      () => api.resetMenu(presetKey),
      { successMessage: t.menuResetDone || "Original menu restored" },
    );
    scheduleReload(["menus"]);
  }, [mutate, scheduleReload, t.menuResetDone]);

  const analyzePhoto = useCallback(async input => {
    try {
      return await api.analyzePhoto(input);
    } catch (error) {
      if (error?.userMessage) {
        notify(error.userMessage === "imageTooLarge" ? (t.scanFailed || "That photo is too large.") : (t.scanFailed || "That photo could not be read."), "error");
      }
      throw error;
    }
  }, [notify, t.scanFailed]);

  const saveNote = useCallback(async (recipeId, personKey, note) => {
    try {
      await api.saveNote(recipeId, personKey, note);
      setData(prev => {
        const notes = prev.notes.filter(row => !(row.recipeId === recipeId && row.personKey === personKey));
        if (note.trim()) notes.push({ recipeId, personKey, note: note.trim() });
        return { ...prev, notes };
      });
      notify(t.noteSaved || "Note saved");
    } catch (error) {
      console.error(error);
      notify(t.savingFailed || "Could not save the note.", "error");
    }
  }, [notify, t]);

  const toggleShoppingItem = useCallback(async (itemKey, checked) => {
    setData(prev => {
      const shoppingChecks = prev.shoppingChecks.filter(row => !(row.weekStart === weekStart && row.itemKey === itemKey));
      if (checked) shoppingChecks.push({ weekStart, itemKey, checked: true });
      return { ...prev, shoppingChecks };
    });
    try {
      await api.setShoppingChecked(weekStart, itemKey, checked);
    } catch (error) {
      console.error(error);
      notify(t.savingFailed || "Could not save the tick.", "error");
      scheduleReload(["shopping_checks"]);
    }
  }, [weekStart, notify, scheduleReload, t.savingFailed]);

  const clearShoppingChecks = useCallback(async () => {
    await mutate(
      state => ({ ...state, shoppingChecks: state.shoppingChecks.filter(row => row.weekStart !== weekStart) }),
      () => api.clearShoppingChecks(weekStart),
    );
  }, [mutate, weekStart]);

  const saveLabel = useCallback(async input => {
    const saved = await api.saveLabel(input);
    scheduleReload(["labels"]);
    return saved;
  }, [scheduleReload]);

  const deleteLabel = useCallback(async key => {
    await mutate(
      state => ({ ...state, labels: state.labels.filter(label => label.key !== key) }),
      () => api.deleteLabel(key),
    );
    scheduleReload(["labels"]);
  }, [mutate, scheduleReload]);

  const saveProduct = useCallback(async input => {
    // Products are flat rows; the sheet closes on its own and the list redraws
    // the moment the server answers. Nothing else on screen depends on them.
    const saved = await api.saveProduct(input);
    setData(previous => ({
      ...previous,
      products: [...previous.products.filter(product => product.key !== saved?.key), saved].filter(Boolean),
    }));
    scheduleReload(["products"]);
    return saved;
  }, [scheduleReload]);

  const deleteProduct = useCallback(async key => {
    await mutate(
      state => ({ ...state, products: state.products.filter(product => product.key !== key) }),
      () => api.deleteProduct(key),
      { successMessage: t.productDeleted },
    );
    scheduleReload(["products"]);
  }, [mutate, scheduleReload, t.productDeleted]);

  /** Drop any marker that would keep a freshly saved recipe out of the pool. */
  const unhide = (state, id) => {
    if (!id) return state;
    const removed = state.removed || [];
    if (!removed.some(row => row.recipeId === id)) return state;
    return { ...state, removed: removed.filter(row => row.recipeId !== id) };
  };

  const saveRecipe = useCallback(async input => {
    try {
      // Draw the recipe (new or edited) at once; a forked library copy gets its
      // real id from `merge` a moment later.
      const draft = input?.name?.en
        ? { ...input, isPreset: false, householdId: dataRef.current.household?.id || null }
        : null;
      const saved = await mutate(
        state => {
          if (!draft) return state;
          const next = upsertRecipe(state, draft);
          return unhide(next, draft.id);
        },
        () => api.saveRecipe(input),
        {
          merge: (state, result) => {
            // Saving a dish under an id this kitchen had taken out means it is
            // wanted after all — never leave it hidden behind an old tombstone.
            const next = upsertRecipe(state, result);
            if (result?.id) api.restoreRecipe(result.id).catch(() => {});
            return unhide(next, result?.id);
          },
        },
      );
      // Library recipes are visible to every household and are not covered by
      // this household's realtime filter, so a light re-read keeps them honest.
      scheduleReload(["recipes"]);
      return saved;
    } catch (error) {
      console.error(error);
      if (error?.errors) throw error;
      notify(t.savingFailed || "Could not save the recipe.", "error");
      throw error;
    }
  }, [mutate, scheduleReload, notify, t.savingFailed]);

  /**
   * Taking a dish out of the pool.
   *
   * Two different things behind one button:
   *   • a recipe the household owns is really deleted (its rows cascade), and a
   *     marker is kept so the screen can still name it and put it back;
   *   • a shared library recipe cannot be deleted — everyone else may still cook
   *     it — so only this household's marker is written.
   * Either way it leaves the picker, the sous-chef, the plan and the shopping
   * list at once; `library` says which of the two happened.
   */
  const deleteRecipe = useCallback(async (id, { library = false } = {}) => {
    const current = dataRef.current;
    const target = (current.recipes || []).find(recipe => recipe.id === id)
      || { id, isPreset: library };
    const marker = removalRow({ ...target, id });
    if (!marker) return;
    await mutate(
      state => ({
        ...state,
        // An owned recipe loses its row; a library one keeps it (it is shared)
        // but joins the removed list, so every screen filters it out.
        recipes: library ? state.recipes : state.recipes.filter(recipe => recipe.id !== id),
        removed: [...(state.removed || []).filter(row => row.recipeId !== id), marker],
        assignments: state.assignments.filter(row => row.recipeId !== id),
        eaten: state.eaten.filter(row => row.recipeId !== id),
        notes: state.notes.filter(row => row.recipeId !== id),
      }),
      async () => {
        await api.removeRecipe(id, library ? null : marker.snapshot || null);
        // The shared row stays; only an own row is really deleted. The marker
        // (with the full snapshot) is written first, so even a failure halfway
        // leaves the dish restorable.
        if (!library) await api.deleteRecipe(id);
      },
      { successMessage: library ? (t.recipeHidden || "Removed from your pool") : (t.recipeDeleted || "Recipe deleted") },
    );
  }, [mutate, t.recipeHidden, t.recipeDeleted]);

  /**
   * Undo a removal: the dish is offered again everywhere at once.
   *
   * A library dish only needs its marker cleared. An own recipe was really
   * deleted, so the snapshot is used to write it back — a "put back" button
   * that merely forgot the marker would leave an empty promise on screen.
   */
  const restoreRecipe = useCallback(async id => {
    const marker = (dataRef.current.removed || []).find(row => row.recipeId === id);
    const rebuilt = marker ? restorableRecipe(marker) : null;
    await mutate(
      state => ({
        ...state,
        removed: (state.removed || []).filter(row => row.recipeId !== id),
        recipes: rebuilt && !state.recipes.some(recipe => recipe.id === rebuilt.id)
          ? [...state.recipes, { ...rebuilt, isPreset: false }]
          : state.recipes,
      }),
      async () => {
        if (rebuilt) {
          try {
            await api.saveRecipe(rebuilt);
          } catch (error) {
            // The copy is already in the library under this id (a retry): the
            // point of the tap is that the dish is offered again.
            if (!/duplicate|already exists|23505/i.test(String(error?.message || error?.code || ""))) throw error;
          }
        }
        await api.restoreRecipe(id);
      },
      { successMessage: t.recipeRestored || "Recipe is back in your pool" },
    );
    // A library recipe's row never left, but a re-read of the marker list is
    // cheap and keeps the screen honest if the same dish was hidden on the
    // other phone while the button was pressed.
    scheduleReload(["removed_recipes"]);
  }, [mutate, scheduleReload, t.recipeRestored]);

  /** Editing a library recipe forks it: the copy's id is only known afterwards. */
  const upsertRecipe = (state, recipe) => {
    if (!recipe?.id) return state;
    const exists = state.recipes.some(row => row.id === recipe.id);
    return {
      ...state,
      recipes: exists
        ? state.recipes.map(row => (row.id === recipe.id ? recipe : row))
        : [...state.recipes, recipe],
    };
  };

  const savePantryItem = useCallback(async item => {
    await guarded(() => api.savePantryItem(item), t.saved || "Pantry updated");
    scheduleReload(["pantry"]);
  }, [guarded, scheduleReload, t.saved]);

  const deletePantryItem = useCallback(async itemKey => {
    await mutate(
      state => ({ ...state, pantry: state.pantry.filter(item => (item.itemKey || `${item.key}|${item.unit}`) !== itemKey) }),
      () => api.deletePantryItem(itemKey),
      { successMessage: t.itemDeleted || "Item removed" },
    );
    scheduleReload(["pantry"]);
  }, [mutate, scheduleReload, t.itemDeleted]);

  const stockPantry = useCallback(async items => {
    await guarded(() => api.stockPantry(items), t.addedToPantry || `${items.length} items added to the pantry`);
    scheduleReload(["pantry"]);
  }, [guarded, scheduleReload, t.addedToPantry]);

  // Renaming the kitchen or changing portions used to reload the whole kitchen
  // — twelve queries — on every tap, which is why the stepper felt laggy and
  // rubber-banded while old responses landed. The screen now updates at once,
  // the row is written in the background, and only that row is merged back.
  const updateHousehold = useCallback(async patch => {
    const before = householdRef.current;
    const optimistic = {};
    if (patch?.name !== undefined) optimistic.name = String(patch.name).slice(0, 80);
    if (patch?.extraPortions !== undefined) {
      optimistic.extraPortions = Math.max(0, Math.min(8, Math.round(Number(patch.extraPortions) || 0)));
    }
    if (before && Object.keys(optimistic).length) {
      setData(previous => previous.household
        ? { ...previous, household: { ...previous.household, ...optimistic } }
        : previous);
    }

    try {
      const updated = await api.updateHousehold(patch);
      if (updated) {
        setData(previous => previous.household
          ? { ...previous, household: { ...previous.household, ...updated } }
          : previous);
      }
      return updated;
    } catch (error) {
      if (before) setData(previous => ({ ...previous, household: before }));
      console.error(error);
      notify(error?.userMessage || t.savingFailed || "Could not save. Check your connection and try again.", "error");
      throw error;
    }
  }, [notify, t]);

  useEffect(() => {
    const facts = (data.products || []).map(productFact).filter(Boolean);
    registerProductFacts(facts);
  }, [data.products]);

  const resetWeek = useCallback(async () => {
    await mutate(
      optimisticReset,
      () => api.resetWeek(),
      { successMessage: t.weekCleared || "Week cleared" },
    );
  }, [mutate, t.weekCleared]);

  const updateDisplayName = useCallback(async displayName => {
    const updated = await api.updateProfile({ displayName });
    if (updated) applyProfile(updated);
  }, [applyProfile]);

  return {
    isDemo,
    isCloudConfigured,
    backendMode,
    session,
    profile,
    household: data.household,
    profiles: data.profiles,
    people,
    recipes: data.recipes,
    recipesById,
    pool,
    poolById,
    removed: data.removed || [],
    hiddenMap,
    sectionHidden,
    assignments: data.assignments,
    plan,
    notesMap,
    eatenMap,
    waterMap,
    checksMap,
    pantry: data.pantry,
    labels: data.labels,
    products: data.products || [],
    lowPantry,
    shoppingList,
    menus,
    extraPortions,
    weekStart,
    authLoading,
    profileLoading,
    profileError,
    profileChecked,
    dataLoading,
    dataReady,
    loadError,
    dataIssues,
    backendHost,
    toast,
    notify,
    signIn,
    signUp,
    signOut,
    createHousehold,
    joinHousehold,
    setMeal,
    setSlot,
    setSplit,
    setSame,
    clearSlot,
    moveSlot,
    hideSection,
    showSection,
    applyMenu,
    toggleEaten,
    setWater,
    saveNote,
    toggleShoppingItem,
    clearShoppingChecks,
    saveRecipe,
    saveLabel,
    deleteLabel,
    saveProduct,
    deleteProduct,
    generateIdea,
    saveMenu,
    deleteMenu,
    resetMenu,
    analyzePhoto,
    deleteRecipe,
    restoreRecipe,
    savePantryItem,
    deletePantryItem,
    stockPantry,
    updateHousehold,
    updateDisplayName,
    resetWeek,
    refresh,
    refreshTables,
    retryConnection,
  };
}
