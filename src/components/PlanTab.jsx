import { useMemo, useState } from "react";
import { C, SLOT_META, SLOTS } from "../theme.js";
import { dayNumber, dayDate, fmtNum, interpolate } from "../lib/format.js";
import { eatenTotals, fullDayTotals } from "../engine/plan.js";
import MealCard from "./MealCard.jsx";
import WaterCard from "./WaterCard.jsx";
import { ConfirmDialog, Modal } from "./ui.jsx";

function SlotLabel({ slot, lang }) {
  return <span className="slot-label">{SLOT_META[slot].icon} {SLOT_META[slot][lang]}</span>;
}

function PersonTotals({ personKey, name, full, eaten, meals, eatenMeals, t }) {
  const color = personKey === "R" ? C.R : C.I;
  const pct = full.kcal > 0 ? Math.min(100, Math.round((eaten.kcal / full.kcal) * 100)) : 0;
  return (
    <div className="person-card" style={{ "--person-color": color, flex: 1 }}>
      <div className="person-name">
        <span className="person-dot" style={{ background: color }} />
        {name}
        <span style={{ marginLeft: "auto", fontWeight: 500, color: C.muted, fontSize: 9.5 }}>
          {eatenMeals}/{meals}
        </span>
      </div>
      <div className="kcal-row">
        <span className="kcal-big">{fmtNum(full.kcal)}</span>
        <span className="tiny">{t.kcal}</span>
        {eaten.kcal > 0 && <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: C.leaf }}>✓ {fmtNum(eaten.kcal)}</span>}
      </div>
      <div className="progress"><div style={{ width: `${pct}%`, background: color }} /></div>
      <div className="macro-row">
        <span className="macro-pill">💪 {fmtNum(eaten.protein)}/{fmtNum(full.protein)}g</span>
        <span className="macro-pill">🌾 {fmtNum(full.carbs)}g</span>
        <span className="macro-pill">🫒 {fmtNum(full.fat)}g</span>
      </div>
    </div>
  );
}

export default function PlanTab({ app, lang, t, day, setDay, todayIdx, onOpenRecipe, onPick, onOpenMenu, onScan }) {
  const dayPlan = app.plan[day];
  const [remove, setRemove] = useState(null);
  const [merge, setMerge] = useState(null);

  const peopleNames = useMemo(() => ({
    R: app.people.R || t.personFallback.R,
    I: app.people.I || t.personFallback.I,
  }), [app.people, t]);

  const viewAs = app.profile?.personKey === "I" ? "I" : "R";
  const otherKey = viewAs === "R" ? "I" : "R";

  const totalsFor = person => {
    const full = fullDayTotals(dayPlan, person);
    const set = new Set();
    for (const slot of SLOTS) {
      const entry = dayPlan[slot];
      if (!entry || entry.mode === "empty") continue;
      const personKey = entry.mode === "both" ? "both" : person;
      if (app.eatenMap[`${day}:${slot}:${personKey}`]) set.add(`${slot}:${personKey}`);
    }
    return { full, ...eatenTotals(dayPlan, person, set) };
  };

  const r = totalsFor("R");
  const i = totalsFor("I");
  const hasAnyMeal = SLOTS.some(slot => dayPlan[slot].mode !== "empty");

  const mealNote = (recipeId, personKey) => app.notesMap[`${recipeId}:${personKey}`] || "";
  const saveNote = (recipeId, personKey) => value => app.saveNote(recipeId, personKey, value);

  const requestMerge = slot => {
    const entry = dayPlan[slot];
    const { R, I } = entry.recipes;
    if (!R || !I || R.id === I.id) {
      app.setSame(day, slot, R || I);
      return;
    }
    setMerge({ slot });
  };

  const confirmRemove = async () => {
    if (!remove) return;
    const entry = dayPlan[remove.slot];
    try {
      if (remove.personKey === "both" || !entry) {
        await app.clearSlot(day, remove.slot);
      } else {
        const otherKeyName = remove.personKey === "R" ? "I" : "R";
        const otherRecipe = entry.recipes[otherKeyName];
        await app.setSlot(day, remove.slot, otherRecipe ? [{ personKey: otherKeyName, recipeId: otherRecipe.id }] : []);
      }
    } catch {
      // handled by the hook
    } finally {
      setRemove(null);
    }
  };

  const dateLabel = (() => {
    const date = dayDate(app.weekStart, day);
    return date.toLocaleDateString(lang === "lt" ? "lt-LT" : "en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  })();

  return (
    <div className="fade-in">
      <div className="row-between" style={{ marginBottom: 12 }}>
        <div>
          <div className="eyebrow">{t.planTitle}</div>
          <h1 className="page-title" style={{ fontSize: 24 }}>{dateLabel}</h1>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn btn-sm btn-soft" onClick={() => onOpenMenu(day)}>
            🍱 {t.dayMenu}
          </button>
          <button type="button" className="icon-btn scan-btn" onClick={onScan} aria-label={t.scanTitle} title={t.scanTitle}>
            📷
          </button>
        </div>
      </div>

      <div className="day-strip" role="tablist" aria-label={t.planTitle}>
        {t.dayNames.map((name, index) => {
          const filled = SLOTS.some(slot => app.plan[index]?.[slot]?.mode !== "empty");
          const isToday = index === todayIdx;
          return (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={day === index}
              aria-label={t.fullDays[index]}
              className={`day-btn ${day === index ? "selected" : ""} ${isToday ? "today" : ""}`}
              onClick={() => setDay(index)}
            >
              <span>{name}</span>
              <span className="day-num">{dayNumber(app.weekStart, index)}</span>
              {filled && <span className="dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <div className="totals-grid" style={{ marginBottom: 12 }}>
        <PersonTotals personKey="R" name={peopleNames.R} full={r.full} eaten={r.totals} meals={r.meals} eatenMeals={r.eatenMeals} t={t} />
        <PersonTotals personKey="I" name={peopleNames.I} full={i.full} eaten={i.totals} meals={i.meals} eatenMeals={i.eatenMeals} t={t} />
      </div>

      <WaterCard
        t={t}
        myName={peopleNames[viewAs]}
        otherName={peopleNames[otherKey]}
        myWater={app.waterMap[`${day}:${viewAs}`] || 0}
        otherWater={app.waterMap[`${day}:${otherKey}`] || 0}
        onChange={value => app.setWater(day, viewAs, value)}
      />

      {!hasAnyMeal && (
        <div className="card card-pad" style={{ marginBottom: 14, background: "linear-gradient(150deg,#f7f3e7,#eef3e7)" }}>
          <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
            <span style={{ fontSize: 26 }} aria-hidden="true">🍽️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--display)", fontSize: 16 }}>{t.emptyDayTitle}</div>
              <p className="caption" style={{ margin: "4px 0 10px" }}>{t.emptyDayBody}</p>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => onPick({ day, slot: "breakfast", mode: "empty", person: null })}>
                  + {t.chooseRecipe}
                </button>
                <button type="button" className="btn btn-sm btn-soft" onClick={() => onOpenMenu(day)}>🍱 {t.menuTitle}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {SLOTS.map(slot => {
        const entry = dayPlan[slot];
        const slotLabel = SLOT_META[slot][lang];

        if (entry.mode === "empty") {
          return (
            <div key={slot} style={{ marginBottom: 9 }}>
              <div style={{ marginBottom: 5 }}><SlotLabel slot={slot} lang={lang} /></div>
              <button
                type="button"
                className="empty-slot"
                onClick={() => onPick({ day, slot, mode: "empty", person: null })}
              >
                <span style={{ width: 26, height: 26, borderRadius: 8, background: C.surface, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: C.leaf }} aria-hidden="true">+</span>
                {t.addMeal}
              </button>
            </div>
          );
        }

        if (entry.mode === "both") {
          const recipe = entry.recipes.R;
          return (
            <div key={slot} style={{ marginBottom: 9 }}>
              <div className="row-between" style={{ marginBottom: 5 }}>
                <SlotLabel slot={slot} lang={lang} />
                <span className="tiny">{t.sameForBoth}</span>
              </div>
              <MealCard
                meal={recipe}
                slotLabel={slotLabel}
                personKey="both"
                lang={lang}
                t={t}
                eaten={!!app.eatenMap[`${day}:${slot}:both`]}
                note={mealNote(recipe.id, "both")}
                onToggleEaten={() => app.toggleEaten(day, slot, "both", recipe)}
                onOpenRecipe={() => onOpenRecipe(recipe, { day, slot, mode: "both", person: null })}
                onChange={() => onPick({ day, slot, mode: "both", person: null })}
                onSplit={() => app.setSplit(day, slot, recipe)}
                onRemove={() => setRemove({ slot, personKey: "both" })}
                onNoteChange={saveNote(recipe.id, "both")}
              />
            </div>
          );
        }

        return (
          <div key={slot} style={{ marginBottom: 9 }}>
            <div className="row-between" style={{ marginBottom: 5 }}>
              <SlotLabel slot={slot} lang={lang} />
              <button type="button" className="btn btn-xs btn-ghost" onClick={() => requestMerge(slot)} style={{ color: C.amber }}>
                ⇄ {t.sameForBoth}
              </button>
            </div>
            {["R", "I"].map(person => {
              const recipe = entry.recipes[person];
              const color = person === "R" ? C.R : C.I;
              if (!recipe) {
                return (
                  <button
                    key={person}
                    type="button"
                    className="empty-slot"
                    style={{ marginBottom: 8, borderColor: `${color}55` }}
                    onClick={() => onPick({ day, slot, mode: "split", person })}
                  >
                    <span className="person-dot" style={{ background: color }} />
                    {peopleNames[person]} · {t.addMeal}
                  </button>
                );
              }
              return (
                <MealCard
                  key={person}
                  meal={recipe}
                  slotLabel={slotLabel}
                  personKey={person}
                  personName={peopleNames[person]}
                  personColor={color}
                  lang={lang}
                  t={t}
                  eaten={!!app.eatenMap[`${day}:${slot}:${person}`]}
                  note={mealNote(recipe.id, person)}
                  onToggleEaten={() => app.toggleEaten(day, slot, person, recipe)}
                  onOpenRecipe={() => onOpenRecipe(recipe, { day, slot, mode: "split", person })}
                  onChange={() => onPick({ day, slot, mode: "split", person })}
                  onMerge={() => requestMerge(slot)}
                  onRemove={() => setRemove({ slot, personKey: person })}
                  onNoteChange={saveNote(recipe.id, person)}
                />
              );
            })}
          </div>
        );
      })}

      <div style={{ height: 10 }} />

      <ConfirmDialog
        open={!!remove}
        title={t.removeMeal}
        body={t.removeMealConfirm}
        confirmLabel={t.removeMeal}
        cancelLabel={t.cancel}
        onClose={() => setRemove(null)}
        onConfirm={confirmRemove}
      />

      <Modal
        open={!!merge}
        onClose={() => setMerge(null)}
        title={t.keepWhich}
        subtitle={t.mergeHint}
        footer={<button type="button" className="btn btn-soft btn-block" onClick={() => setMerge(null)}>{t.cancel}</button>}
      >
        {merge && (
          <div className="stack">
            {["R", "I"].map(person => {
              const recipe = dayPlan[merge.slot].recipes[person];
              if (!recipe) return null;
              const color = person === "R" ? C.R : C.I;
              return (
                <button
                  key={person}
                  type="button"
                  className="recipe-option"
                  onClick={() => { app.setSame(day, merge.slot, recipe); setMerge(null); }}
                >
                  <span className="opt-emoji">{recipe.emoji}</span>
                  <span style={{ flex: 1 }}>
                    <span className="opt-name">{recipe.name?.[lang] || recipe.name?.en}</span>
                    <span className="opt-meta">
                      <span style={{ color, fontWeight: 700 }}>{peopleNames[person]}</span>
                      <span>🔥 {fmtNum(recipe.kcal)} {t.kcal}</span>
                    </span>
                  </span>
                  <span style={{ color: C.muted }}>›</span>
                </button>
              );
            })}
          </div>
        )}
      </Modal>

      <p className="tiny" style={{ textAlign: "center", marginTop: 14 }}>
        {interpolate(t.dayProgress, { done: r.eatenMeals + i.eatenMeals, total: r.meals + i.meals })}
      </p>
    </div>
  );
}
