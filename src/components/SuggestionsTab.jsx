import { useEffect, useMemo, useRef, useState } from "react";
import { C, SLOT_META, SLOTS, TAG_LABELS } from "../theme.js";
import { allPlannedRecipes } from "../engine/plan.js";
import { plannedIds, suggestRecipes, targetFromRecipe } from "../engine/recommend.js";
import { fmtNum, interpolate, todayIndex } from "../lib/format.js";
import { tagLabel } from "../lib/labels.js";
import { Chip, EmptyState, Field, Modal, NumberInput, Segmented } from "./ui.jsx";

function reasonText(reason, t, lang) {
  switch (reason.key) {
    case "reasonKcal": return interpolate(t.reasonKcal, reason.values);
    case "reasonPantry": return interpolate(t.reasonPantry, reason.values);
    case "reasonShared": return interpolate(t.reasonShared, reason.values);
    case "reasonTag": return interpolate(t.reasonTag, { tag: TAG_LABELS[lang]?.[reason.values?.tag] || reason.values?.tag });
    default: return t[reason.key] || "";
  }
}

export default function SuggestionsTab({ app, lang, t, onOpenRecipe, onCreateRecipe, onReviewIdea }) {
  const [source, setSource] = useState("plan");
  const [refKey, setRefKey] = useState("");
  const [slot, setSlot] = useState("lunch");
  const [target, setTarget] = useState({ kcal: 500, protein: 25, carbs: 45, fat: 22 });
  const [filters, setFilters] = useState({ highProtein: false, quick: false, lowFodmap: false, pantryFirst: true, excludeRecent: true });
  const [addRecipe, setAddRecipe] = useState(null);
  const [addDay, setAddDay] = useState(todayIndex());
  const [addSlot, setAddSlot] = useState("lunch");
  const [wish, setWish] = useState("");
  const [idea, setIdea] = useState(null);
  const [ideaBusy, setIdeaBusy] = useState(false);
  const seedRef = useRef(1 + Math.floor(Math.random() * 90000));

  const refs = useMemo(() => allPlannedRecipes(app.plan).map(item => ({
    ...item,
    key: `${item.day}:${item.slot}:${item.person}`,
    label: `${t.dayNames[item.day]} · ${SLOT_META[item.slot][lang]} · ${item.recipe.name?.[lang] || item.recipe.name?.en}`,
  })), [app.plan, lang, t]);

  useEffect(() => {
    if (!refs.length) { setRefKey(""); return; }
    if (!refs.some(ref => ref.key === refKey)) {
      setRefKey(refs[0].key);
      setTarget(targetFromRecipe(refs[0].recipe));
      setSlot(refs[0].slot);
    }
  }, [refs, refKey]);

  const reference = refs.find(ref => ref.key === refKey) || null;

  useEffect(() => {
    if (!refs.length && source === "plan") setSource("target");
  }, [refs.length, source]);

  const chooseReference = key => {
    setRefKey(key);
    const ref = refs.find(item => item.key === key);
    if (ref) {
      setTarget(targetFromRecipe(ref.recipe));
      setSlot(ref.slot);
    }
  };

  const recentIds = useMemo(() => plannedIds(app.plan), [app.plan]);

  const suggestions = useMemo(() => suggestRecipes({
    recipes: app.recipes,
    plan: app.plan,
    reference: source === "plan" ? reference?.recipe || null : null,
    target,
    slot,
    pantry: app.pantry,
    recentIds,
    filters,
    limit: 8,
  }), [app.recipes, app.plan, source, reference, target, slot, app.pantry, recentIds, filters]);

  const toggleFilter = key => setFilters(previous => ({ ...previous, [key]: !previous[key] }));

  // The controls sit below the Generate button, so the button used to look like
  // it had no inputs. This line says, in words, what pressing it will make.
  const ideaSummary = [
    SLOT_META[slot]?.[lang] || slot,
    `${fmtNum(target.kcal)} ${t.kcal}`,
    filters.highProtein ? t.highProtein : null,
    filters.quick ? t.quickOnly : null,
    filters.lowFodmap ? t.onlyFodmap : null,
    filters.pantryFirst ? t.pantryFirst : null,
    wish.trim() ? `“${wish.trim().slice(0, 40)}”` : null,
  ].filter(Boolean).join(" · ");

  const generateIdea = async () => {
    setIdeaBusy(true);
    const seed = seedRef.current;
    seedRef.current += 37;
    const excludeNames = [
      ...app.recipes.map(recipe => recipe.name?.en).filter(Boolean),
      ...suggestions.map(item => item.recipe.name?.en).filter(Boolean),
      ...(idea ? [idea.name?.en] : []),
    ].filter(Boolean);
    try {
      const draft = await app.generateIdea({ slot, target, filters, seed, excludeNames, notes: wish.trim() });
      if (!draft) {
        app.notify(t.ideaFailed, "error");
      } else {
        setIdea(draft);
      }
    } catch {
      app.notify(t.ideaFailed, "error");
    } finally {
      setIdeaBusy(false);
    }
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

  return (
    <div className="fade-in">
      <div className="eyebrow">🤖 {t.navSuggest}</div>
      <h1 className="page-title">{t.suggestTitle}</h1>
      <p className="page-sub">{t.suggestSub}</p>

      <div className="ai-note">
        <span style={{ fontSize: 18 }} aria-hidden="true">🧠</span>
        <span style={{ flex: 1 }}>
          <b>{t.aiTitle}</b><br />
          {t.aiBody}
        </span>
        {idea && (
          <span className={`tag ${idea.ai ? "ok" : ""}`} style={{ alignSelf: "flex-start", whiteSpace: "nowrap" }}>
            {idea.ai ? `🤖 ${t.ideaAi}` : `✨ ${t.ideaOffline}`}
          </span>
        )}
      </div>

      <details className="ai-explain">
        <summary>{t.aiExplainTitle}</summary>
        <p>{t.aiExplainBody}</p>
        {idea && !idea.ai && (
          <>
            <p className="tiny" style={{ marginTop: 6 }}><b>{t.aiNeedsSetupTitle}</b></p>
            <p className="tiny" style={{ marginTop: 2 }}>{t.aiNeedsSetupBody}</p>
          </>
        )}
      </details>

      <div className="card card-pad idea-card">
        <div className="row-between" style={{ alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">✨ {t.navSuggest}</div>
            <div className="idea-title">{t.ideaTitle}</div>
            <p className="caption" style={{ margin: "3px 0 0" }}>{t.ideaSub}</p>
          </div>
          <button type="button" className="btn btn-sm btn-primary" onClick={generateIdea} disabled={ideaBusy} style={{ flexShrink: 0 }}>
            {ideaBusy ? t.generatingIdea : idea ? t.rerollIdea : t.generateIdea}
          </button>
        </div>
        <p className="tiny" style={{ margin: "9px 0 0" }}>
          <b style={{ color: C.leaf }}>{t.ideaWillMake}:</b> {ideaSummary}
        </p>

        {idea && (
          <div className="idea-preview">
            <div className="row" style={{ gap: 9, alignItems: "flex-start" }}>
              <span className="idea-emoji" aria-hidden="true">{idea.emoji || "🍽️"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="idea-name">{idea.name?.[lang] || idea.name?.en}</div>
                <div className="opt-meta">
                  <span>{SLOT_META[idea.slot]?.[lang]}</span>
                  <span>🔥 {fmtNum(idea.kcal)}</span>
                  <span>💪 {fmtNum(idea.protein)}g</span>
                  <span>🌾 {fmtNum(idea.carbs)}g</span>
                  <span>🫒 {fmtNum(idea.fat)}g</span>
                  {idea.prepMinutes ? <span>⏱ {idea.prepMinutes} {t.minutes}</span> : null}
                </div>
              </div>
              <span className={`tag ${idea.ai ? "ok" : ""}`}>{idea.ai ? `🤖 ${t.ideaAi}` : `✨ ${t.ideaOffline}`}</span>
            </div>

            <div className="row" style={{ gap: 4, flexWrap: "wrap", marginTop: 8 }}>
              {[...(idea.tags || []), ...(idea.ai ? [] : [])].filter(tag => tag !== "vegetarian").slice(0, 5).map(tag => (
                <span key={tag} className="stock-badge">{tagLabel(tag, lang, app.labels)}</span>
              ))}
            </div>

            <ul className="idea-ingredients">
              {(idea.ingredients || []).slice(0, 6).map((ingredient, index) => (
                <li key={`${ingredient.en}-${index}`}>
                  <span>{ingredient.en || ingredient.key}</span>
                  <span>{fmtNum(ingredient.amount)} {ingredient.unit}</span>
                </li>
              ))}
            </ul>

            <div className="row" style={{ gap: 6, marginTop: 10 }}>
              <button type="button" className="btn btn-sm btn-soft" onClick={generateIdea} disabled={ideaBusy}>
                {ideaBusy ? t.generatingIdea : t.rerollIdea}
              </button>
              <button type="button" className="btn btn-sm btn-primary" style={{ flex: 1 }} onClick={() => onReviewIdea(idea)}>
                {t.ideaEdit}
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setIdea(null)} aria-label={t.close}>✕</button>
            </div>
            <p className="tiny" style={{ marginTop: 6 }}>{t.ideaSavedHint}</p>
          </div>
        )}
      </div>

      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <Segmented
          value={source}
          onChange={value => { setSource(value); if (value === "plan" && reference) setTarget(targetFromRecipe(reference.recipe)); }}
          options={[
            { value: "plan", label: t.chooseReference, icon: "📋" },
            { value: "target", label: t.adjustTargets, icon: "🎯" },
          ]}
        />

        {source === "plan" ? (
          refs.length ? (
            <div style={{ marginTop: 12 }}>
              <Field label={t.chooseReference}>
                <select className="select" value={refKey} onChange={event => chooseReference(event.target.value)}>
                  {refs.map(ref => <option key={ref.key} value={ref.key}>{ref.label}</option>)}
                </select>
              </Field>
            </div>
          ) : (
            <p className="caption" style={{ marginTop: 12 }}>{t.noReference}</p>
          )
        ) : (
          <div style={{ marginTop: 12 }}>
            <div className="form-grid">
              <Field label={`${t.kcal} 🔥`}>
                <NumberInput value={target.kcal} min={100} max={2000} ariaLabel={t.kcal}
                  onChange={value => setTarget({ ...target, kcal: Number(value) || 0 })} />
              </Field>
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
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <Field label={t.ideaWish}>
            <input
              className="input"
              type="text"
              value={wish}
              maxLength={120}
              placeholder={t.ideaWishPlaceholder}
              onChange={event => setWish(event.target.value)}
            />
          </Field>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{t.slot}</div>
          <div className="row" style={{ gap: 5, overflowX: "auto", paddingBottom: 2 }}>
            {SLOTS.map(slotKey => (
              <Chip key={slotKey} active={slot === slotKey} onClick={() => setSlot(slotKey)}>
                {SLOT_META[slotKey].icon} {SLOT_META[slotKey][lang]}
              </Chip>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{t.filters}</div>
          <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>
            <Chip active={filters.highProtein} onClick={() => toggleFilter("highProtein")} tone={filters.highProtein ? "" : "sky"}>💪 {t.highProtein}</Chip>
            <Chip active={filters.quick} onClick={() => toggleFilter("quick")} tone={filters.quick ? "" : "sage"}>⚡ {t.quickOnly}</Chip>
            <Chip active={filters.lowFodmap} onClick={() => toggleFilter("lowFodmap")} tone={filters.lowFodmap ? "" : "sage"}>🌿 {t.onlyFodmap}</Chip>
            <Chip active={filters.pantryFirst} onClick={() => toggleFilter("pantryFirst")} tone={filters.pantryFirst ? "" : "amber"}>🥫 {t.pantryFirst}</Chip>
            <Chip active={filters.excludeRecent} onClick={() => toggleFilter("excludeRecent")} tone={filters.excludeRecent ? "" : "amber"}>🔁 {t.excludeRecent}</Chip>
          </div>
        </div>

        <div className="divider" />
        <div className="row-between">
          <span className="tiny">{t.targetNutrition}</span>
          <span className="row" style={{ gap: 8 }}>
            <span className="tiny">🔥 {fmtNum(target.kcal)}</span>
            <span className="tiny">💪 {fmtNum(target.protein)}g</span>
            <span className="tiny">🌾 {fmtNum(target.carbs)}g</span>
            <span className="tiny">🫒 {fmtNum(target.fat)}g</span>
          </span>
        </div>
      </div>

      <div className="section-title">
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
