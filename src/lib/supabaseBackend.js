import { mondayISO, createId } from "./format.js";
import { describeLoadError } from "./errors.js";
import { sanitizePantryItem, sanitizeRecipe, sanitizeNote, sanitizeWater, sanitizeMenu, sanitizePhotoPayload, sanitizeLabel } from "./validate.js";

const mapProfile = row => row && ({
  id: row.id,
  householdId: row.household_id,
  personKey: row.person_key,
  displayName: row.display_name,
});

const mapHousehold = row => row && ({
  id: row.id,
  name: row.name,
  inviteCode: row.invite_code,
  extraPortions: Number(row.extra_portions) || 0,
});

export const mapRecipeRow = row => row && ({
  id: row.id,
  householdId: row.household_id,
  isPreset: row.household_id === null,
  name: { en: row.name_en, lt: row.name_lt || row.name_en },
  emoji: row.emoji || "🍽️",
  slot: row.slot,
  kcal: Number(row.kcal) || 0,
  protein: Number(row.protein) || 0,
  carbs: Number(row.carbs) || 0,
  fat: Number(row.fat) || 0,
  ingredients: Array.isArray(row.ingredients) ? row.ingredients.map(ing => ({
    key: ing.key,
    en: ing.en,
    lt: ing.lt || ing.en,
    amount: Number(ing.amount) || 0,
    unit: ing.unit,
  })) : [],
  method: { en: row.method_en || "", lt: row.method_lt || row.method_en || "" },
  tags: Array.isArray(row.tags) ? row.tags : ["vegetarian"],
  vegetarian: row.vegetarian !== false,
  prepMinutes: Number(row.prep_minutes) || 0,
  updatedAt: row.updated_at,
});

const mapMenuRow = row => row && ({
  id: row.id,
  presetKey: row.preset_key || null,
  name: { en: row.name_en, lt: row.name_lt || row.name_en },
  emoji: row.emoji || "🍱",
  items: row.items && typeof row.items === "object" ? row.items : {},
});

const mapAssignment = row => ({
  day: row.day_index,
  slot: row.slot,
  personKey: row.person_key,
  recipeId: row.recipe_id,
});

const mapPantry = row => ({
  key: row.ingredient_key,
  itemKey: row.item_key,
  nameEn: row.name_en,
  nameLt: row.name_lt,
  unit: row.unit,
  quantity: Number(row.quantity) || 0,
  lowThreshold: Number(row.low_threshold) || 0,
});

const recipeRow = (recipe, userId) => ({
  id: recipe.id,
  household_id: recipe.householdId,
  name_en: recipe.name.en,
  name_lt: recipe.name.lt,
  emoji: recipe.emoji,
  slot: recipe.slot,
  kcal: Math.round(recipe.kcal),
  protein: recipe.protein,
  carbs: recipe.carbs,
  fat: recipe.fat,
  ingredients: recipe.ingredients,
  method_en: recipe.method.en,
  method_lt: recipe.method.lt,
  tags: recipe.tags,
  vegetarian: true,
  prep_minutes: recipe.prepMinutes,
  created_by: userId,
});

function raise(error) {
  if (error) throw error;
}

export function createSupabaseBackend(client) {
  let ctx = { userId: null, householdId: null, personKey: "R" };

  return {
    mode: "cloud",
    demo: false,

    async getSession() {
      const { data, error } = await client.auth.getSession();
      raise(error);
      return data.session;
    },

    onAuthChange(callback) {
      const { data } = client.auth.onAuthStateChange((_event, session) => callback(session));
      return () => data?.subscription?.unsubscribe();
    },

    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      raise(error);
      return data;
    },

    async signUp(email, password) {
      const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL || "/"}`;
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo },
      });
      raise(error);
      if (data?.session?.user) ctx.userId = data.session.user.id;
      return { needsConfirmation: !data?.session, user: data?.user };
    },

    async signOut() {
      ctx = { userId: null, householdId: null, personKey: "R" };
      const { error } = await client.auth.signOut();
      raise(error);
    },

    setContext(next) {
      ctx = { ...ctx, ...next };
    },

    async refreshSession() {
      const { data, error } = await client.auth.refreshSession();
      if (error) throw error;
      ctx = { ...ctx, userId: data?.session?.user?.id || ctx.userId };
      return data?.session || null;
    },

    async getProfile() {
      if (!ctx.userId) return null;
      const { data, error } = await client.from("profiles").select("*").eq("id", ctx.userId).maybeSingle();
      raise(error);
      const profile = mapProfile(data);
      if (profile) ctx = { ...ctx, householdId: profile.householdId, personKey: profile.personKey };
      return profile;
    },

    async createHousehold(name, personName, personKey) {
      const { data, error } = await client.rpc("create_household", {
        p_name: name,
        p_person_name: personName,
        p_person_key: personKey,
      });
      raise(error);
      return Array.isArray(data) ? data[0] : data;
    },

    async joinHousehold(code, personName, personKey) {
      const { data, error } = await client.rpc("join_household", {
        p_code: code,
        p_person_name: personName,
        p_person_key: personKey,
      });
      raise(error);
      return data;
    },

    async loadAll() {
      const hid = ctx.householdId;
      if (!hid) return null;

      // One query per table, each allowed to fail on its own. A project that was
      // never upgraded (or a single blocked table) should still open the kitchen
      // with the data it does have instead of dead-ending on a blank error page.
      const queries = {
        household: () => client.from("households").select("*").eq("id", hid).maybeSingle(),
        profiles: () => client.from("profiles").select("*").eq("household_id", hid),
        recipes: () => client.from("recipes").select("*"),
        assignments: () => client.from("meal_assignments").select("*").eq("household_id", hid),
        eaten: () => client.from("eaten").select("*").eq("household_id", hid).eq("eaten", true),
        water: () => client.from("water").select("*").eq("household_id", hid),
        notes: () => client.from("recipe_notes").select("*").eq("household_id", hid),
        checks: () => client.from("shopping_checks").select("*").eq("household_id", hid).eq("week_start", mondayISO()),
        pantry: () => client.from("pantry").select("*").eq("household_id", hid),
        menus: () => client.from("menus").select("*").eq("household_id", hid),
        sections: () => client.from("day_sections").select("*").eq("household_id", hid),
        labels: () => client.from("labels").select("*").eq("household_id", hid),
      };

      const entries = await Promise.all(
        Object.entries(queries).map(async ([table, run]) => {
          try {
            const result = await run();
            return { table, data: result?.data ?? null, error: result?.error || null };
          } catch (error) {
            return { table, data: null, error };
          }
        }),
      );

      const byTable = Object.fromEntries(entries.map(entry => [entry.table, entry]));
      const rows = table => (Array.isArray(byTable[table]?.data) ? byTable[table].data : []);
      const single = table => (byTable[table]?.data && !Array.isArray(byTable[table].data) ? byTable[table].data : null);

      const issues = entries
        .filter(entry => entry.error)
        .map(entry => describeLoadError(entry.error, entry.table));

      // If the household row itself is unreadable there is nothing to show, so
      // stop with a described error rather than pretending the kitchen is empty.
      if (byTable.household?.error) {
        const own = issues.find(issue => issue.table === "household") || issues[0] || {};
        throw Object.assign(new Error(own.message || "household_unavailable"), own);
      }
      if (!single("household")) {
        throw Object.assign(new Error("household_not_found"), { kind: "not_found", table: "households" });
      }

      // A dead token poisons every table at once — surface it as an auth problem
      // so the app can refresh the session once and retry.
      const authIssue = issues.find(issue => issue.kind === "auth");
      if (authIssue && !byTable.recipes?.data) throw Object.assign(new Error(authIssue.message), authIssue);

      return {
        household: mapHousehold(single("household")),
        profiles: rows("profiles").map(mapProfile),
        recipes: rows("recipes").map(mapRecipeRow),
        assignments: rows("assignments").map(mapAssignment),
        eaten: rows("eaten").filter(row => row.eaten).map(row => ({
          day: row.day_index,
          slot: row.slot,
          personKey: row.person_key,
          eaten: row.eaten,
          recipeId: row.recipe_id,
          applied: Array.isArray(row.applied) ? row.applied : [],
        })),
        water: rows("water").map(row => ({ day: row.day_index, personKey: row.person_key, ml: Number(row.ml) || 0 })),
        notes: rows("notes").map(row => ({ recipeId: row.recipe_id, personKey: row.person_key, note: row.note })),
        shoppingChecks: rows("checks").map(row => ({ weekStart: row.week_start, itemKey: row.item_key, checked: row.checked })),
        pantry: rows("pantry").map(mapPantry),
        menus: rows("menus").map(mapMenuRow),
        hiddenSections: rows("sections").map(row => ({ day: row.day_index, slot: row.slot })),
        labels: rows("labels").map(row => ({ key: row.key, label: row.label })),
        issues,
      };
    },

    subscribe(callback) {
      const hid = ctx.householdId;
      if (!hid) return () => {};
      let timer;
      const trigger = () => {
        clearTimeout(timer);
        timer = setTimeout(callback, 220);
      };
      const channel = client.channel(`household-${hid}`);
      const tables = ["meal_assignments", "eaten", "water", "recipe_notes", "shopping_checks", "pantry", "recipes", "menus", "day_sections", "labels"];
      for (const table of tables) {
        channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `household_id=eq.${hid}` }, trigger);
      }
      channel.on("postgres_changes", { event: "*", schema: "public", table: "households", filter: `id=eq.${hid}` }, trigger);
      channel.on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `household_id=eq.${hid}` }, trigger);
      channel.subscribe();
      return () => {
        clearTimeout(timer);
        client.removeChannel(channel);
      };
    },

    async saveRecipe(input) {
      const { ok, errors, recipe } = sanitizeRecipe(input, { existingId: input?.id });
      if (!ok) throw Object.assign(new Error("Invalid recipe"), { errors });

      // Presets are shared and read-only: editing one forks a household copy.
      const { data: existing, error: lookupError } = await client
        .from("recipes").select("household_id").eq("id", recipe.id).maybeSingle();
      raise(lookupError);
      if (existing && existing.household_id !== null && existing.household_id !== ctx.householdId) {
        throw new Error("Recipe belongs to another household");
      }
      if (existing && existing.household_id === null) {
        recipe.id = `${recipe.id.slice(0, 60)}-${createId().slice(-6)}`;
      }

      const row = recipeRow({ ...recipe, householdId: ctx.householdId }, ctx.userId);
      const { data, error } = await client.from("recipes").upsert(row, { onConflict: "id" }).select("*").single();
      raise(error);
      return mapRecipeRow(data);
    },

    async deleteRecipe(id) {
      const { data, error } = await client.from("recipes").delete()
        .eq("id", id).eq("household_id", ctx.householdId).select("id");
      raise(error);
      if (!data?.length) throw new Error("Library recipes are read-only");
      return true;
    },

    async setSlot(day, slot, rows) {
      const { error } = await client.rpc("set_slot", {
        p_day: day,
        p_slot: slot,
        p_assignments: rows
          .filter(row => row.recipeId)
          .map(row => ({ person_key: row.personKey, recipe_id: row.recipeId })),
      });
      raise(error);
      return true;
    },

    async applyMenu(day, menu) {
      const items = {};
      for (const [slot, entry] of Object.entries(menu.items || {})) {
        if (entry.both) items[slot] = [{ person_key: "both", recipe_id: entry.both }];
        else items[slot] = ["R", "I"].filter(p => entry[p]).map(p => ({ person_key: p, recipe_id: entry[p] }));
      }
      const { error } = await client.rpc("apply_day_menu", { p_day: day, p_items: items });
      raise(error);
      return true;
    },

    async moveSlot(day, fromSlot, toSlot) {
      const { error } = await client.rpc("move_slot", {
        p_day: day,
        p_from: fromSlot,
        p_to: toSlot,
      });
      raise(error);
      return true;
    },

    async setSectionHidden(day, slot, hidden) {
      const { error } = await client.rpc("set_section_hidden", {
        p_day: day,
        p_slot: slot,
        p_hidden: !!hidden,
      });
      raise(error);
      return true;
    },

    async toggleEaten({ day, slot, personKey, factor = 1, recipeId = null }) {
      const { data, error } = await client.rpc("toggle_eaten", {
        p_day: day,
        p_slot: slot,
        p_person_key: personKey,
        p_factor: factor,
        p_recipe_id: recipeId,
      });
      raise(error);
      return !!data;
    },

    async setWater(day, personKey, ml) {
      const value = sanitizeWater(ml);
      const { error } = await client.from("water").upsert({
        household_id: ctx.householdId,
        day_index: day,
        person_key: personKey,
        ml: value,
        updated_by: ctx.userId,
      }, { onConflict: "household_id,day_index,person_key" });
      raise(error);
      return value;
    },

    async saveNote(recipeId, personKey, note) {
      const value = sanitizeNote(note);
      if (!value) {
        const { error } = await client.from("recipe_notes").delete()
          .eq("household_id", ctx.householdId).eq("recipe_id", recipeId).eq("person_key", personKey);
        raise(error);
        return "";
      }
      const { error } = await client.from("recipe_notes").upsert({
        household_id: ctx.householdId,
        recipe_id: recipeId,
        person_key: personKey,
        note: value,
        updated_by: ctx.userId,
      }, { onConflict: "household_id,recipe_id,person_key" });
      raise(error);
      return value;
    },

    async setShoppingChecked(weekStart, itemKey, checked) {
      if (!checked) {
        const { error } = await client.from("shopping_checks").delete()
          .eq("household_id", ctx.householdId).eq("week_start", weekStart).eq("item_key", itemKey);
        raise(error);
        return false;
      }
      const { error } = await client.from("shopping_checks").upsert({
        household_id: ctx.householdId,
        week_start: weekStart,
        item_key: itemKey,
        checked: true,
      }, { onConflict: "household_id,week_start,item_key" });
      raise(error);
      return true;
    },

    async clearShoppingChecks(weekStart) {
      const { error } = await client.from("shopping_checks").delete()
        .eq("household_id", ctx.householdId).eq("week_start", weekStart);
      raise(error);
    },

    async savePantryItem(input) {
      const { ok, item, errors } = sanitizePantryItem(input);
      if (!ok) throw Object.assign(new Error("Invalid pantry item"), { errors });
      const row = {
        household_id: ctx.householdId,
        item_key: `${item.key}|${item.unit}`,
        ingredient_key: item.key,
        name_en: item.nameEn,
        name_lt: item.nameLt,
        unit: item.unit,
        quantity: item.quantity,
        low_threshold: item.lowThreshold,
        updated_by: ctx.userId,
      };
      const { error } = await client.from("pantry").upsert(row, { onConflict: "household_id,item_key" });
      raise(error);
      return item;
    },

    async deletePantryItem(itemKey) {
      const { error } = await client.from("pantry").delete()
        .eq("household_id", ctx.householdId).eq("item_key", itemKey);
      raise(error);
      return true;
    },

    async stockPantry(items) {
      const payload = [];
      for (const input of items) {
        const { ok, item } = sanitizePantryItem(input);
        if (!ok) continue;
        payload.push({
          key: item.key,
          name_en: item.nameEn,
          name_lt: item.nameLt,
          unit: item.unit,
          quantity: item.quantity,
          low_threshold: item.lowThreshold,
        });
      }
      if (!payload.length) return 0;
      const { error } = await client.rpc("add_pantry_stock", { p_items: payload });
      raise(error);
      return payload.length;
    },

    async saveMenu(input) {
      const { ok, errors, menu } = sanitizeMenu(input, { existingId: input?.id });
      if (!ok) throw Object.assign(new Error("Invalid menu"), { errors });

      if (menu.presetKey) {
        // Editing a library menu stores a single override keyed to the preset.
        const { data: preset, error: presetError } = await client
          .from("menus").select("id").is("household_id", null).eq("id", menu.presetKey).maybeSingle();
        raise(presetError);
        if (!preset) throw new Error("Unknown library menu");
        const { error } = await client.rpc("save_menu", {
          p_id: null,
          p_preset_key: menu.presetKey,
          p_name_en: menu.name.en,
          p_name_lt: menu.name.lt,
          p_emoji: menu.emoji,
          p_items: menu.items,
        });
        raise(error);
        return menu;
      }

      const { error } = await client.rpc("save_menu", {
        p_id: menu.id,
        p_preset_key: null,
        p_name_en: menu.name.en,
        p_name_lt: menu.name.lt,
        p_emoji: menu.emoji,
        p_items: menu.items,
      });
      raise(error);
      return menu;
    },

    async deleteMenu(id) {
      const { error } = await client.from("menus").delete().eq("id", id).eq("household_id", ctx.householdId);
      raise(error);
      return true;
    },

    async resetMenu(presetKey) {
      const { error } = await client.from("menus").delete()
        .eq("household_id", ctx.householdId).eq("preset_key", presetKey);
      raise(error);
      return true;
    },

    async saveLabel(input) {
      const { ok, errors, label } = sanitizeLabel(input);
      if (!ok) throw Object.assign(new Error("Invalid label"), { errors });
      const { error } = await client.from("labels").upsert({
        household_id: ctx.householdId,
        key: label.key,
        label: label.label,
      }, { onConflict: "household_id,key" });
      raise(error);
      return label;
    },

    async deleteLabel(key) {
      const { error } = await client.from("labels").delete()
        .eq("household_id", ctx.householdId).eq("key", key);
      raise(error);
      return true;
    },

    async generateRecipe(payload) {
      const { data, error } = await client.functions.invoke("recipe-ai", { body: payload });
      raise(error);
      if (!data || data.available !== true || !data.recipe) {
        return { available: false, reason: data?.reason || "ai_offline" };
      }
      return { available: true, recipe: data.recipe };
    },

    async analyzePhoto(input) {
      const { ok, error, payload } = sanitizePhotoPayload(input);
      if (!ok) throw Object.assign(new Error(error || "invalidImage"), { userMessage: error });
      const { data, error: invokeError } = await client.functions.invoke("nutrition-scan", { body: payload });
      raise(invokeError);
      if (!data || data.available !== true) return { available: false, reason: data?.reason || "ai_offline", size: payload.image.length };
      return { available: true, mode: payload.mode, nutrition: data.nutrition || null, items: Array.isArray(data.items) ? data.items : [] };
    },

    async setExtraPortions(value) {
      return this.updateHousehold({ extraPortions: value });
    },

    async updateHousehold(patch = {}) {
      const row = {};
      if (patch.name) row.name = String(patch.name).slice(0, 80);
      if (patch.extraPortions !== undefined) {
        row.extra_portions = Math.max(0, Math.min(8, Math.round(Number(patch.extraPortions) || 0)));
      }
      const { data, error } = await client.from("households").update(row).eq("id", ctx.householdId).select("*").single();
      raise(error);
      return mapHousehold(data);
    },

    async updateProfile(patch = {}) {
      const row = {};
      if (patch.displayName) row.display_name = String(patch.displayName).slice(0, 40);
      const { data, error } = await client.from("profiles").update(row).eq("id", ctx.userId).select("*").single();
      raise(error);
      return mapProfile(data);
    },

    async resetWeek() {
      const { error } = await client.rpc("reset_week");
      raise(error);
      return true;
    },
  };
}
