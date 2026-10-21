import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, isDemo, isCloudConfigured, backendMode, backendHost } from "../lib/api.js";
import { projectHost } from "../lib/errors.js";
import { buildPlan } from "../engine/plan.js";
import { buildShoppingList } from "../engine/shopping.js";
import { lowItems } from "../engine/pantry.js";
import { mergeMenus } from "../lib/menus.js";
import { PRESET_MENUS } from "../data/presets.js";
import { mondayISO, debounce } from "../lib/format.js";
import { requestRecipeIdea } from "../lib/ideas.js";

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
  hiddenSections: [],
};

export function useAppData(t = {}) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [data, setData] = useState(EMPTY);
  // Used to roll a failed optimistic write back without reloading everything.
  const householdRef = useRef(null);
  householdRef.current = data.household;
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

  const loadAll = useCallback(async ({ silent = false, retried = false } = {}) => {
    if (!profileRef.current?.householdId) return;
    if (!silent) setDataLoading(true);
    try {
      const next = await withTimeout(Promise.resolve(api.loadAll()), 20000, "kitchen");
      if (next) {
        setData({ ...EMPTY, ...next });
        setDataIssues(Array.isArray(next.issues) ? next.issues : []);
        setLoadError(null);
      }
    } catch (error) {
      // A stale access token is the most common cause of a blank kitchen. Refresh
      // the session once and try again before showing anything to the user.
      if (!retried && (error?.kind === "auth" || String(error?.message || "").match(/jwt|token/i))) {
        try {
          await api.refreshSession?.();
          setDataLoading(false);
          return loadAll({ silent, retried: true });
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

  useEffect(() => {
    if (!profile?.householdId) return undefined;
    const refresh = debounce(() => reloadRef.current({ silent: true }), 200);
    const unsubscribe = api.subscribe(refresh);
    return () => {
      refresh.flush?.();
      unsubscribe?.();
    };
  }, [profile?.householdId]);

  const refresh = useCallback(() => loadAll({ silent: true }), [loadAll]);

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

  const plan = useMemo(
    () => buildPlan(data.assignments, recipesById),
    [data.assignments, recipesById],
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
  const guarded = useCallback(async (fn, successMessage = null) => {
    try {
      const result = await fn();
      if (successMessage) notify(successMessage);
      await refresh();
      return result;
    } catch (error) {
      console.error(error);
      const message = error?.message?.toLowerCase() || "";
      if (message.includes("invalid_code")) notify(t.invalidCode || "That invite code was not found.", "error");
      else if (message.includes("person_taken")) notify(t.personTaken || "That person slot is already taken.", "error");
      else if (message.includes("already_linked")) notify(t.alreadyLinked || "This account is already linked to a kitchen.", "error");
      else notify(error?.userMessage || t.savingFailed || "Could not save. Check your connection and try again.", "error");
      throw error;
    }
  }, [notify, refresh, t]);

  const setSlot = useCallback(async (day, slot, rows) => {
    await guarded(() => api.setSlot(day, slot, rows));
  }, [guarded]);

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
    await guarded(() => api.moveSlot(day, fromSlot, toSlot));
  }, [guarded]);

  const hideSection = useCallback(async (day, slot) => {
    await guarded(() => api.setSectionHidden(day, slot, true));
  }, [guarded]);

  const showSection = useCallback(async (day, slot) => {
    await guarded(() => api.setSectionHidden(day, slot, false));
  }, [guarded]);

  const generateIdea = useCallback(input => requestRecipeIdea({
    api,
    ...input,
    pantry: input?.pantry || data.pantry,
  }), [data.pantry]);

  const applyMenu = useCallback(async (day, menu) => {
    await guarded(() => api.applyMenu(day, menu));
  }, [guarded]);

  const toggleEaten = useCallback(async (day, slot, personKey, recipe) => {
    if (!recipe) return;
    const factor = personKey === "both" ? 2 : 1;
    try {
      await api.toggleEaten({ day, slot, personKey, factor, recipeId: recipe.id });
      await refresh();
    } catch (error) {
      console.error(error);
      notify(t.savingFailed || "Could not update the pantry.", "error");
    }
  }, [refresh, notify, t.savingFailed]);

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
      await refresh();
      return saved;
    } catch (error) {
      console.error(error);
      if (error?.errors) throw error;
      notify(t.savingFailed || "Could not save the menu.", "error");
      throw error;
    }
  }, [refresh, notify, t.savingFailed]);

  const deleteMenu = useCallback(async id => {
    await guarded(() => api.deleteMenu(id), t.menuDeleted || "Menu deleted");
  }, [guarded, t.menuDeleted]);

  const resetMenu = useCallback(async presetKey => {
    await guarded(() => api.resetMenu(presetKey), t.menuResetDone || "Original menu restored");
  }, [guarded, t.menuResetDone]);

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
      await refresh();
    }
  }, [weekStart, notify, refresh, t.savingFailed]);

  const clearShoppingChecks = useCallback(async () => {
    await guarded(() => api.clearShoppingChecks(weekStart));
  }, [guarded, weekStart]);

  const saveLabel = useCallback(async input => {
    const saved = await api.saveLabel(input);
    await refresh();
    return saved;
  }, [refresh]);

  const deleteLabel = useCallback(async key => {
    await guarded(() => api.deleteLabel(key));
  }, [guarded]);

  const saveRecipe = useCallback(async input => {
    try {
      const saved = await api.saveRecipe(input);
      await refresh();
      return saved;
    } catch (error) {
      console.error(error);
      if (error?.errors) throw error;
      notify(t.savingFailed || "Could not save the recipe.", "error");
      throw error;
    }
  }, [refresh, notify, t.savingFailed]);

  const deleteRecipe = useCallback(async id => {
    await guarded(() => api.deleteRecipe(id), t.recipeDeleted || "Recipe deleted");
  }, [guarded, t.recipeDeleted]);

  const savePantryItem = useCallback(async item => {
    await guarded(() => api.savePantryItem(item), t.saved || "Pantry updated");
  }, [guarded, t.saved]);

  const deletePantryItem = useCallback(async itemKey => {
    await guarded(() => api.deletePantryItem(itemKey), t.itemDeleted || "Item removed");
  }, [guarded, t.itemDeleted]);

  const stockPantry = useCallback(async items => {
    await guarded(() => api.stockPantry(items), t.addedToPantry || `${items.length} items added to the pantry`);
  }, [guarded, t.addedToPantry]);

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

  const resetWeek = useCallback(async () => {
    await guarded(() => api.resetWeek(), t.weekCleared || "Week cleared");
  }, [guarded, t.weekCleared]);

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
    generateIdea,
    saveMenu,
    deleteMenu,
    resetMenu,
    analyzePhoto,
    deleteRecipe,
    savePantryItem,
    deletePantryItem,
    stockPantry,
    updateHousehold,
    updateDisplayName,
    resetWeek,
    refresh,
    retryConnection,
  };
}
