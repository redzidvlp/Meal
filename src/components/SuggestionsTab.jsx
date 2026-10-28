import { useMemo, useRef, useState } from "react";
import { C, SLOT_META, SLOTS, TAG_LABELS } from "../theme.js";
import { plannedIds, suggestRecipes, targetFromRecipe } from "../engine/recommend.js";
import { parseWish, resolveIngredient, wishChips } from "../lib/wishes.js";
import { GENERATOR_GROUPS, INGREDIENT_FACTS, allFacts, factFor } from "../data/ingredientFacts.js";
import { fmtNum, interpolate, todayIndex } from "../lib/format.js";
import { allPlannedRecipes } from "../engine/plan.js";
import { Chip, EmptyState, Field, Modal, NumberInput } from "./ui.jsx";
import ProductSheet from "./ProductSheet.jsx";
import { productFact } from "../lib/products.js";
import { matchIngredients } from "../lib/picker.js";
import { aiReasonKey } from "../lib/aiReasons.js";

const TAG_LABEL = (lang, tag) => TAG_LABELS[lang]?.[tag] || tag;

function reasonText(reason, t, lang) {
  switch (reason.key) {
    case "reasonKcal": return interpolate(t.reasonKcal, reason.values);
    case "reasonPantry": return interpolate(t.reasonPantry, reason.values);
    case "reasonShared": return interpolate(t.reasonShared, reason.values);
    case "reasonTag": return interpolate(t.reasonTag, { tag: TAG_LABEL(lang, reason.values?.tag) });
    default: return t[reason.key] || "";
  }
}

const COURSE_CHOICES = [
  { value: null, label: "courseAny", icon: "🍽️" },
  { value: "sweet", label: "courseSweet", icon: "🍰" },
  { value: "savoury", label: "courseSavoury", icon: "🥘" },
];

const TIME_CHOICES = [0, 15, 20, 30];

export default function SuggestionsTab({ app, lang, t, onOpenRecipe, onCreateRecipe, onReviewIdea }) {
  // One card holds everything the recipe is built from. There is deliberately
  // no "pick a meal first" step: the sous-chef writes from your words.
  const [wishText, setWishText] = useState("");
  // Ingredients the person insists on. Known ones become real facts the engine
  // can compute with; anything else stays a name and is handed to the model.
  const [pins, setPins] = useState([]);
  const [pinDraft, setPinDraft] = useState("");
  // The list under the box opens on tap as well as on typing: on a phone a
  // person has to be able to discover what can be pinned without guessing a
  // name and hoping autocomplete appears.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerIndex, setPickerIndex] = useState(-1);
  const [productSheet, setProductSheet] = useState(false);
  const [course, setCourse] = useState(null);
  const [slot, setSlot] = useState("lunch");
  const [maxMinutes, setMaxMinutes] = useState(0);
  const [target, setTarget] = useState({ kcal: 500, protein: 25, carbs: 45, fat: 22 });
  const [moreOpen, setMoreOpen] = useState(false);
  const [filters, setFilters] = useState({ highProtein: false, lowFodmap: false, pantryFirst: true, excludeRecent: true });
  const [baseKey, setBaseKey] = useState("");
  const [baseOpen, setBaseOpen] = useState(false);
  const [addRecipe, setAddRecipe] = useState(null);
  const [addDay, setAddDay] = useState(todayIndex());
  const [addSlot, setAddSlot] = useState("lunch");
  const [idea, setIdea] = useState(null);
  const [ideaBusy, setIdeaBusy] = useState(false);
  // Ingredients used by recent ideas, so a reroll changes the dish.
  const [usedKeys, setUsedKeys] = useState([]);
  const seedRef = useRef(1 + Math.floor(Math.random() * 90000));
  const ideaRef = useRef(null);

  const parsedWish = useMemo(() => parseWish(wishText), [wishText]);
  const pinKeys = useMemo(() => pins.map(pin => pin.key).filter(Boolean), [pins]);
  const pinKeyString = pinKeys.join(",");
  const wish = useMemo(() => {
    const merged = { ...parsedWish, includes: [...new Set([...parsedWish.includes, ...pinKeys])] };
    return course ? { ...merged, course } : merged;
  }, [parsedWish, course, pinKeyString]);
  const chips = wishChips(wish);

  const plannedRefs = useMemo(() => allPlannedRecipes(app.plan).map(item => ({
    ...item,
    key: `${item.day}:${item.slot}:${item.person}`,
    label: `${t.dayNames[item.day]} · ${SLOT_META[item.slot][lang]} · ${item.recipe.name?.[lang] || item.recipe.name?.en}`,
  })), [app.plan, lang, t]);
  const baseMeal = plannedRefs.find(ref => ref.key === baseKey) || null;

  const recentIds = useMemo(() => plannedIds(app.plan), [app.plan]);

  // The list below is a different feature: scoring recipes you already own.
  const suggestions = useMemo(() => suggestRecipes({
    recipes: app.recipes,
    plan: app.plan,
    reference: baseMeal?.recipe || null,
    target,
    slot,
    pantry: app.pantry,
    recentIds,
    filters: { ...filters, quick: maxMinutes > 0 && maxMinutes <= 15 },
    limit: 8,
  }), [app.recipes, app.plan, baseMeal, target, slot, app.pantry, recentIds, filters, maxMinutes]);

  const toggleFilter = key => setFilters(previous => ({ ...previous, [key]: !previous[key] }));

  const addPin = raw => {
    const text = String(raw || "").trim();
    if (!text) return;
    const key = factFor(text) ? text : resolveIngredient(text);
    // The label comes from whichever table knows the key — a saved product is
    // not in INGREDIENT_FACTS, and without this its chip read "p-vegan-ham".
    const fact = key ? factFor(key) : null;
    const label = fact ? (fact[lang] || fact.en) : text.slice(0, 40);
    setPins(previous => (
      previous.some(pin => (key ? pin.key === key : pin.label.toLowerCase() === label.toLowerCase()))
        ? previous
        : [...previous, { id: `${key || "text"}-${previous.length}`, key, label }].slice(0, 5)
    ));
    setPinDraft("");
  };
  const removePin = id => setPins(previous => previous.filter(pin => pin.id !== id));
  // A product saved a moment ago is registered by the data hook, not by this
  // screen, so the list is rebuilt when the shelf changes as well.
  const productSignature = (app.products || []).map(product => `${product.key}:${product.nameEn}`).join("|");
  const pickerRows = useMemo(() => matchIngredients(pinDraft, {
    facts: allFacts(),
    lang,
    limit: 8,
    exclude: pinKeys,
  }), [pinDraft, lang, pinKeyString, productSignature]);
  const chooseRow = row => {
    addPin(row.key);
    setPickerOpen(false);
    setPickerIndex(-1);
  };
  // A product that was just saved is not in the registry yet, so it is pinned
  // from its own fact instead of waiting for the next refresh.
  const addPinFact = fact => setPins(previous => (
    fact && !previous.some(pin => pin.key === fact.key)
      ? [...previous, { id: fact.key, key: fact.key, label: fact[lang] || fact.en }].slice(0, 5)
      : previous
  ));
  // After an edit the product is already pinned; only its name may have moved.
  const refreshPinFact = fact => setPins(previous => previous.map(pin => (
    fact && pin.key === fact.key ? { ...pin, label: fact[lang] || fact.en } : pin
  )));

  // The calorie box may be empty for a moment while it is being retyped; the
  // engine still needs a number, and the default is what the card shows.
  const safeTarget = useMemo(() => ({
    ...target,
    kcal: Number(target.kcal) > 0 ? Number(target.kcal) : 500,
  }), [target]);

  const ideaSummary = [
    wish.course === "sweet" ? `🍰 ${t.courseSweet}` : wish.course === "savoury" ? `🥘 ${t.courseSavoury}` : (SLOT_META[slot]?.[lang] || slot),
    `${fmtNum(safeTarget.kcal)} ${t.kcal}`,
    maxMinutes ? `${maxMinutes} ${t.minutes}` : t.anyTime,
    pins.length ? `${t.ideaWith} ${pins.map(pin => pin.label).join(" + ")}` : null,
    wish.excludes.length ? `✕ ${wish.excludes.map(key => INGREDIENT_FACTS[key]?.en || key).join(", ")}` : null,
    filters.highProtein ? t.highProtein : null,
    filters.lowFodmap ? t.onlyFodmap : null,
  ].filter(Boolean).join(" · ");

  const generateIdea = async () => {
    setIdeaBusy(true);
    const seed = seedRef.current;
    seedRef.current += 37;
    const excludeNames = [
      ...app.recipes.map(recipe => recipe.name?.en).filter(Boolean),
      ...(idea ? [idea.name?.en] : []),
    ].filter(Boolean);
    try {
      const draft = await app.generateIdea({
        slot, target: safeTarget, filters, seed, excludeNames,
        notes: wishText.trim(), wish, avoidKeys: usedKeys, maxMinutes,
        mustInclude: pinKeys,
        mustNames: pins.filter(pin => !pin.key).map(pin => pin.label),
      });
      if (!draft) {
        app.notify(t.ideaFailed, "error");
      } else {
        setIdea(draft);
        setUsedKeys(previous => [...new Set([
          ...previous,
          ...(draft.ingredients || []).map(item => item.key).filter(Boolean),
        ])].slice(-24));
        requestAnimationFrame(() => ideaRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" }));
      }
    } catch {
      app.notify(t.ideaFailed, "error");
    } finally {
      setIdeaBusy(false);
    }
  };

  const useBaseMeal = key => {
    setBaseKey(key);
    const ref = plannedRefs.find(item => item.key === key);
    if (!ref) return;
    setTarget(targetFromRecipe(ref.recipe));
    setSlot(ref.slot);
  };

  const openAdd = recipe => {
    setAddRecipe(recipe);
    setAddDay(todayIndex());
    setAddSlot(recipe.slot || slot || "lunch");
  };

  const confirmAdd = async () => {
    if (!addRecipe) return;
    try {
      await app.setMeal(addDay, addSlot, addRecipe.id, "both");
      app.notify(interpolate(t.addedToPlan, { day: t.dayNames[addDay], slot: SLOT_META[addSlot][lang] }));
      setAddRecipe(null);
    } catch {
      // handled by the hook
    }
  };

  const aiNoteKey = idea?.aiNote === "ignored"
    ? "aiNoteIgnored"
    : idea?.aiNote === "failed"
      ? "aiNoteFailed"
      : idea?.aiNote === "unavailable"
        ? "aiNoteUnavailable"
        : null;
  const reasonKey = aiNoteKey ? aiReasonKey(idea?.aiReason) : null;

  return (
    <div className="fade-in">
      <div className="eyebrow">🤖 {t.navSuggest}</div>
      <h1 className="page-title">{t.suggestTitle}</h1>
      <p className="page-sub">{t.suggestSub}</p>

      <div className="card card-pad sous-card">
        <Field label={t.ideaWish} hint={t.ideaWishHint}>
          <textarea
            className="textarea"
            data-field="wish"
            rows={2}
            value={wishText}
            maxLength={160}
            placeholder={t.ideaWishPlaceholder}
            onChange={event => setWishText(event.target.value)}
          />
        </Field>

        <div className="sous-row">
          <div className="eyebrow">⭐ {t.mustInclude}</div>
          <p className="tiny" style={{ margin: "-2px 0 2px" }}>{t.mustIncludeHint}</p>
          {pins.length > 0 && (
            <div className="row" style={{ gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
              {pins.map(pin => (
                <span key={pin.id} className={`pin-chip ${pin.key ? "" : "unknown"}`}>
                  <span className="pin-chip-label">{pin.key ? "✓" : "✎"} {pin.label}</span>
                  <button type="button" onClick={() => removePin(pin.id)} aria-label={`${t.remove} ${pin.label}`}>✕</button>
                </span>
              ))}
            </div>
          )}
          <div className="row" style={{ gap: 6 }}>
            <input
              className="input"
              data-field="must"
              value={pinDraft}
              maxLength={40}
              placeholder={t.mustIncludePlaceholder}
              autoComplete="off"
              role="combobox"
              aria-expanded={pickerOpen}
              aria-controls="sous-ingredients"
              aria-autocomplete="list"
              onFocus={() => setPickerOpen(true)}
              onClick={() => setPickerOpen(true)}
              onChange={event => {
                setPinDraft(event.target.value);
                setPickerOpen(true);
                setPickerIndex(-1);
              }}
              onBlur={() => {
                // A tap on a row has to win the race against the blur.
                setTimeout(() => setPickerOpen(false), 180);
              }}
              onKeyDown={event => {
                if (event.key === "Escape") { setPickerOpen(false); setPickerIndex(-1); return; }
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  if (!pickerOpen) { setPickerOpen(true); return; }
                  const count = pickerRows.length;
                  if (!count) return;
                  setPickerIndex(previous => (event.key === "ArrowDown"
                    ? (previous < count - 1 ? previous + 1 : 0)
                    : (previous > 0 ? previous - 1 : count - 1)));
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  const row = pickerOpen && pickerIndex >= 0 ? pickerRows[pickerIndex] : null;
                  if (row) chooseRow(row); else addPin(pinDraft);
                  setPickerOpen(false);
                  setPickerIndex(-1);
                }
              }}
            />
            <button
              type="button"
              className="btn btn-sm btn-ghost picker-toggle"
              data-action="toggle-picker"
              aria-label={t.mustInclude}
              aria-expanded={pickerOpen}
              onClick={() => { setPickerOpen(open => !open); setPickerIndex(-1); }}
            >
              ▾
            </button>
            <button
              type="button"
              className="btn btn-sm btn-soft"
              data-action="add-must"
              disabled={!pinDraft.trim() || pins.length >= 5}
              onClick={() => { addPin(pinDraft); setPickerOpen(false); setPickerIndex(-1); }}
            >
              ＋ {t.add}
            </button>
          </div>
          {/* Sometimes the obvious name is not the one in the table ("goat
              cheese" vs "Halloumi"), so typing something unknown still allows
              adding it as free text below the list. */}
          {pickerOpen && !pickerRows.length && pinDraft.trim() && (
            <p className="tiny picker-empty" data-picker="empty">
              {t.pickerNoMatch}
            </p>
          )}
          {pickerOpen && pickerRows.length > 0 && (
            <div className="picker-list" id="sous-ingredients" role="listbox" data-picker="must">
              {pickerRows.map((row, index) => (
                <button
                  key={row.key}
                  type="button"
                  role="option"
                  aria-selected={index === pickerIndex}
                  data-pick={row.key}
                  className={`picker-row ${index === pickerIndex ? "is-active" : ""} ${row.pinned ? "is-pinned" : ""}`}
                  onPointerDown={event => { event.preventDefault(); if (!row.pinned) chooseRow(row); }}
                  onMouseDown={event => { event.preventDefault(); if (!row.pinned) chooseRow(row); }}
                  onClick={() => { if (!row.pinned) chooseRow(row); }}
                >
                  <span className="picker-name">
                    {row.product ? "🏷️ " : ""}{row.label}
                    {row.pinned ? <span className="picker-taken"> ✓ {t.alreadyAdded}</span> : null}
                  </span>
                  <span className="picker-meta">{Math.round(row.kcal)} {t.kcal} · {row.protein} g</span>
                </button>
              ))}
            </div>
          )}
          <div className="row" style={{ gap: 4, flexWrap: "wrap", marginTop: 6 }}>
            {["vegan-meat", "natural-tofu", "canned-chickpeas", "lentils", "eggs", "curd"].map(key => (
              <button
                key={key}
                type="button"
                className="chip sage"
                style={{ minHeight: 26, padding: "0 8px", fontSize: 10 }}
                onClick={() => addPin(INGREDIENT_FACTS[key]?.en || key)}
              >
                {INGREDIENT_FACTS[key]?.shortEn || INGREDIENT_FACTS[key]?.en || key}
              </button>
            ))}
            <button
              type="button"
              className="chip sky"
              style={{ minHeight: 26, padding: "0 8px", fontSize: 10 }}
              data-action="add-product"
              onClick={() => setProductSheet(true)}
            >
              ＋ {t.ownProduct}
            </button>
            <span className="tiny" style={{ alignSelf: "center" }}>{GENERATOR_GROUPS.protein.length} {t.proteinStaples}</span>
          </div>

          {(app.products || []).length > 0 && (
            <div style={{ marginTop: 8 }} data-shelf>
              <div className="row-between" style={{ marginBottom: 5 }}>
                <div className="eyebrow">🏷️ {t.myProducts} <span className="shelf-count">{app.products.length}</span></div>
                <button
                  type="button"
                  className="btn btn-xs btn-ghost"
                  data-action="manage-products"
                  onClick={() => setProductSheet(true)}
                >
                  ⚙️ {t.manageProducts}
                </button>
              </div>
              {/* One line that scrolls sideways. A shelf of twenty products
                  used to push the rest of the page off the screen. */}
              <div className="product-shelf" data-products="saved">
                {app.products.map(product => {
                  const active = pinKeys.includes(product.key);
                  const name = lang === "lt" && product.nameLt ? product.nameLt : product.nameEn;
                  return (
                    <button
                      key={product.key}
                      type="button"
                      data-product={product.key}
                      title={name}
                      className={`chip product-chip ${active ? "active" : "sage"}`}
                      onClick={() => (active ? removePin(product.key) : addPinFact(productFact(product)))}
                    >
                      {active ? "✓ " : ""}
                      <span className="product-chip-name">{name}</span>
                      <span className="product-chip-meta">{Math.round(product.kcal)} · {product.protein}g</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {(wish.includes.length > 0 || wish.excludes.length > 0 || chips.length > 0) && (
          <div className="row" style={{ gap: 4, flexWrap: "wrap", marginTop: 7 }}>
            {chips.map(chip => (
              <span key={chip.key} className="stock-badge" style={{ borderColor: C.leaf, color: C.leaf, fontWeight: 700 }}>
                {chip.key === "course-sweet" ? "🍰" : chip.key === "quick" ? "⚡" : chip.key === "lactose-free" ? "🥛" : "🌿"} {chip.label}
              </span>
            ))}
            {wish.includes.map(key => (
              <span key={`in-${key}`} className="stock-badge" style={{ borderColor: C.leaf, color: C.leaf }}>
                ✓ {INGREDIENT_FACTS[key]?.en || key}
              </span>
            ))}
            {wish.excludes.map(key => (
              <span key={`out-${key}`} className="stock-badge" style={{ textDecoration: "line-through" }}>
                ✕ {INGREDIENT_FACTS[key]?.en || key}
              </span>
            ))}
          </div>
        )}

        <div className="sous-row">
          <div className="eyebrow">{t.readyIn}</div>
          <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>
            {TIME_CHOICES.map(minutes => (
              <Chip key={minutes} active={maxMinutes === minutes} onClick={() => setMaxMinutes(minutes)} tone={maxMinutes === minutes ? "" : "sage"}>
                {minutes ? `${minutes} ${t.minutes}` : t.anyTime}
              </Chip>
            ))}
          </div>
        </div>

        <div className="sous-row">
          <div className="eyebrow">{t.slot}</div>
          <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>
            {SLOTS.map(slotKey => (
              <Chip key={slotKey} active={slot === slotKey} onClick={() => setSlot(slotKey)}>
                {SLOT_META[slotKey].icon} {SLOT_META[slotKey][lang]}
              </Chip>
            ))}
          </div>
        </div>

        <div className="sous-row">
          <div className="eyebrow">{t.courseLabel}</div>
          <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>
            {COURSE_CHOICES.map(choice => (
              <Chip key={choice.label} active={course === choice.value} onClick={() => setCourse(choice.value)} tone={course === choice.value ? "" : "sky"}>
                {choice.icon} {t[choice.label]}
              </Chip>
            ))}
          </div>
        </div>

        <div className="sous-row">
          <div className="eyebrow">{t.filters}</div>
          <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>
            <Chip active={filters.highProtein} onClick={() => toggleFilter("highProtein")} tone={filters.highProtein ? "" : "sky"}>💪 {t.highProtein}</Chip>
            <Chip active={filters.lowFodmap} onClick={() => toggleFilter("lowFodmap")} tone={filters.lowFodmap ? "" : "sage"}>🌿 {t.onlyFodmap}</Chip>
            <Chip active={filters.pantryFirst} onClick={() => toggleFilter("pantryFirst")} tone={filters.pantryFirst ? "" : "amber"}>🥫 {t.pantryFirst}</Chip>
            <Chip active={filters.excludeRecent} onClick={() => toggleFilter("excludeRecent")} tone={filters.excludeRecent ? "" : "amber"}>🔁 {t.excludeRecent}</Chip>
          </div>
        </div>

        <div className="sous-row">
          <Field label={`🔥 ${t.caloriesPerPortion}`}>
            <NumberInput
              value={target.kcal}
              min={150}
              max={1500}
              ariaLabel={t.caloriesPerPortion}
              onChange={value => setTarget({ ...target, kcal: Number(value) || 0 })}
            />
          </Field>
        </div>

        <button type="button" className="btn btn-link" style={{ padding: "6px 0", alignSelf: "flex-start", color: C.muted, fontSize: 11 }} onClick={() => setMoreOpen(open => !open)}>
          {moreOpen ? "−" : "+"} {t.moreNutrition}
        </button>
        {moreOpen && (
          <div className="form-grid-3" style={{ marginBottom: 8 }}>
            <Field label={`${t.protein} 💪`}>
              <NumberInput value={target.protein} min={0} max={120} ariaLabel={t.protein}
                onChange={value => setTarget({ ...target, protein: Number(value) || 0 })} />
            </Field>
            <Field label={`${t.carbs} 🌾`}>
              <NumberInput value={target.carbs} min={0} max={200} ariaLabel={t.carbs}
                onChange={value => setTarget({ ...target, carbs: Number(value) || 0 })} />
            </Field>
            <Field label={`${t.fat} 🫒`}>
              <NumberInput value={target.fat} min={0} max={150} ariaLabel={t.fat}
                onChange={value => setTarget({ ...target, fat: Number(value) || 0 })} />
            </Field>
          </div>
        )}

        <div className="divider" />

        <button type="button" className="btn btn-primary btn-block" data-action="generate" onClick={generateIdea} disabled={ideaBusy}>
          {ideaBusy ? t.generatingIdea : t.generateIdea}
        </button>
        <p className="tiny" style={{ margin: "9px 0 0" }}>
          <b style={{ color: C.leaf }}>{t.ideaWillMake}:</b> {ideaSummary}
        </p>

        <details className="ai-explain" style={{ margin: "12px 0 0" }} open={baseOpen} onToggle={event => setBaseOpen(event.target.open)}>
          <summary>{t.baseOnMeal}</summary>
          {plannedRefs.length ? (
            <div style={{ marginTop: 8 }}>
              <select className="select" value={baseKey} onChange={event => useBaseMeal(event.target.value)}>
                <option value="">{t.baseOnNone}</option>
                {plannedRefs.map(ref => <option key={ref.key} value={ref.key}>{ref.label}</option>)}
              </select>
              <p className="tiny" style={{ marginTop: 6 }}>{t.baseOnMealHint}</p>
            </div>
          ) : (
            <p className="tiny" style={{ marginTop: 6 }}>{t.noReference}</p>
          )}
        </details>
      </div>

      {idea && (
        <div className="card card-pad idea-card" ref={ideaRef}>
          <div className="row-between" style={{ alignItems: "flex-start", gap: 8 }}>
            <div className="row" style={{ gap: 9, alignItems: "flex-start", flex: 1, minWidth: 0 }}>
              <span className="idea-emoji" aria-hidden="true">{idea.emoji || "🍽️"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="idea-name">{idea.name?.[lang] || idea.name?.en}</div>
                <div className="opt-meta">
                  {idea.course === "sweet" && <span>🍰 {t.courseSweet}</span>}
                  <span>{SLOT_META[idea.slot]?.[lang]}</span>
                  <span>🔥 {fmtNum(idea.kcal)}</span>
                  <span>💪 {fmtNum(idea.protein)}g</span>
                  <span>🌾 {fmtNum(idea.carbs)}g</span>
                  <span>🫒 {fmtNum(idea.fat)}g</span>
                  {idea.prepMinutes ? <span>⏱ {idea.prepMinutes} {t.minutes}</span> : null}
                </div>
              </div>
            </div>
            <span className={`tag ${idea.ai ? "ok" : ""}`} style={{ whiteSpace: "nowrap" }}>
              {idea.ai ? `🤖 ${t.ideaAi}` : `✨ ${t.ideaOffline}`}
            </span>
          </div>

          {(idea.tags || []).length > 0 && (
            <div className="row" style={{ gap: 4, flexWrap: "wrap", marginTop: 8 }}>
              {(idea.tags || []).filter(tag => tag !== "vegetarian").slice(0, 5).map(tag => (
                <span key={tag} className="stock-badge">{tagLabelSafe(tag, lang, app.labels)}</span>
              ))}
            </div>
          )}

          <ul className="idea-ingredients">
            {(idea.ingredients || []).slice(0, 8).map((ingredient, index) => (
              <li key={`${ingredient.en}-${index}`}>
                <span>{ingredient.en || ingredient.key}</span>
                <span>{fmtNum(ingredient.amount)} {ingredient.unit}</span>
              </li>
            ))}
          </ul>

          {(idea.requested || []).length > 0 && (idea.missing || []).length === 0 && (
            <p className="pin-line ok">✓ {t.ideaWith} {idea.requested.join(", ")}</p>
          )}
          {(idea.missing || []).length > 0 && (
            <p className="pin-line warn">
              ⚠ {t.ideaMissing} {idea.missing.join(", ")}. {t.ideaMissingHint}
            </p>
          )}
          {idea.usesIgnored && <p className="pin-line warn">{t.ideaUsesIgnored}</p>}
          {idea.relaxed && <p className="pin-line warn">{t.ideaRelaxed}</p>}
          {target.protein > 0 && idea.protein < target.protein * 0.9 && (
            <p className="pin-line warn">
              {interpolate(t.ideaProteinShort, { got: fmtNum(idea.protein), want: fmtNum(target.protein) })}
            </p>
          )}
          {aiNoteKey && (
            <p className="ai-note-line">
              {t[aiNoteKey]}
              {reasonKey ? <span className="ai-reason"> {t[reasonKey]}</span> : null}
            </p>
          )}

          <div className="row" style={{ gap: 6, marginTop: 10 }}>
            <button type="button" className="btn btn-sm btn-soft" data-action="reroll" onClick={generateIdea} disabled={ideaBusy}>
              {ideaBusy ? t.generatingIdea : t.rerollIdea}
            </button>
            <button type="button" className="btn btn-sm btn-primary" data-action="review" style={{ flex: 1 }} onClick={() => onReviewIdea(idea)}>
              {t.ideaEdit}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setIdea(null)} aria-label={t.close}>✕</button>
          </div>
          <p className="tiny" style={{ marginTop: 6 }}>{t.ideaSavedHint}</p>
        </div>
      )}

      <div className="section-title" style={{ marginTop: 20 }}>
        <span>{t.scoreLabel}</span>
        <span className="tiny">{suggestions.length}</span>
      </div>

      {suggestions.length === 0 ? (
        <EmptyState
          icon="🧑‍🍳"
          title={t.noSuggestions}
          body={t.noSuggestionsHint}
          action={<button type="button" className="btn btn-sm btn-primary" onClick={onCreateRecipe}>{t.newRecipe}</button>}
        />
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {suggestions.map(({ recipe, score, reasons }) => (
            <div key={recipe.id} className="suggest-card">
              <div className="match-ring" style={{ "--pct": score }} role="img" aria-label={`${score}% ${t.matchScore}`}>
                <span>{score}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 19 }} aria-hidden="true">{recipe.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--display)", fontSize: 13.5, lineHeight: 1.35 }}>
                      {recipe.name?.[lang] || recipe.name?.en}
                    </div>
                    <div className="opt-meta">
                      <span>{SLOT_META[recipe.slot]?.[lang]}</span>
                      <span>🔥 {fmtNum(recipe.kcal)}</span>
                      <span>💪 {fmtNum(recipe.protein)}g</span>
                      <span>🌾 {fmtNum(recipe.carbs)}g</span>
                      <span>🫒 {fmtNum(recipe.fat)}g</span>
                    </div>
                  </div>
                </div>

                {reasons.length > 0 && (
                  <div className="reason-list">
                    {reasons.map((reason, index) => (
                      <span key={`${reason.key}-${index}`} className="reason">{reasonText(reason, t, lang)}</span>
                    ))}
                  </div>
                )}

                <div className="row" style={{ gap: 5, marginTop: 9 }}>
                  <button type="button" className="btn btn-xs btn-soft" onClick={() => onOpenRecipe(recipe)}>{t.viewRecipe}</button>
                  <button type="button" className="btn btn-xs btn-primary" onClick={() => openAdd(recipe)}>＋ {t.useInPlan}</button>
                  {recipe.tags?.includes("vegetarian") && <span className="chip sage static" style={{ marginLeft: "auto", padding: "2px 6px", fontSize: 9 }}>🌿 {TAG_LABELS[lang].vegetarian}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProductSheet
        open={productSheet}
        onClose={() => setProductSheet(false)}
        products={app.products || []}
        lang={lang}
        t={t}
        app={app}
        onDelete={async key => {
          // A removed product must not stay pinned: the next idea would be
          // built around something that no longer exists.
          setPins(previous => previous.filter(pin => pin.key !== key));
          await app.deleteProduct(key);
        }}
        onSave={async input => {
          const saved = await app.saveProduct(input);
          if (saved) {
            const fact = productFact(saved);
            addPinFact(fact);
            refreshPinFact(fact);
          }
          return saved;
        }}
      />

      <Modal
        open={!!addRecipe}
        onClose={() => setAddRecipe(null)}
        title={t.useInPlan}
        subtitle={addRecipe ? (addRecipe.name?.[lang] || addRecipe.name?.en) : ""}
        footer={(
          <>
            <button type="button" className="btn btn-soft" style={{ flex: 1 }} onClick={() => setAddRecipe(null)}>{t.cancel}</button>
            <button type="button" className="btn btn-primary" style={{ flex: 1.3 }} onClick={confirmAdd}>{t.add}</button>
          </>
        )}
      >
        <Field label={t.chooseDay}>
          <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
            {t.dayNames.map((name, index) => (
              <Chip key={name} active={addDay === index} onClick={() => setAddDay(index)}>{name}</Chip>
            ))}
          </div>
        </Field>
        <div style={{ height: 12 }} />
        <Field label={t.chooseSlot} hint={t.splitHint}>
          <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
            {SLOTS.map(slotKey => (
              <Chip key={slotKey} active={addSlot === slotKey} onClick={() => setAddSlot(slotKey)}>
                {SLOT_META[slotKey].icon} {SLOT_META[slotKey][lang]}
              </Chip>
            ))}
          </div>
        </Field>
        <p className="tiny" style={{ marginTop: 12, color: C.amber }}>{t.replaceHint}</p>
      </Modal>
    </div>
  );
}

// Custom labels live alongside built-in tags; a missing key must not throw.
function tagLabelSafe(tag, lang, labels) {
  const custom = (labels || []).find(label => `x-${label.key}` === tag);
  if (custom) return custom.label;
  return TAG_LABEL(lang, tag);
}
