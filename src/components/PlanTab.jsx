import { useEffect, useMemo, useRef, useState } from "react";
import { C, SLOT_META, SLOTS } from "../theme.js";
import { dayNumber, dayDate, fmtNum, interpolate } from "../lib/format.js";
import { eatenTotals, fullDayTotals } from "../engine/plan.js";
import MealCard from "./MealCard.jsx";
import WaterCard from "./WaterCard.jsx";
import { ConfirmDialog, Modal } from "./ui.jsx";

function SlotLabel({ slot, lang }) {
  return <span className="slot-label">{SLOT_META[slot].icon} {SLOT_META[slot][lang]}</span>;
}

function SlotHead({ slot, lang, t, extra, onHide }) {
  return (
    <div className="slot-head">
      <SlotLabel slot={slot} lang={lang} />
      <div className="slot-head-actions">
        {extra}
        <button
          type="button"
          className="slot-remove"
          onClick={onHide}
          aria-label={t.hideSection}
          title={t.hideSection}
        >
          ⊖
        </button>
      </div>
    </div>
  );
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
  const [move, setMove] = useState(null);
  const [hide, setHide] = useState(null);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);

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
      if (app.sectionHidden(day, slot)) continue;
      const entry = dayPlan[slot];
      if (!entry || entry.mode === "empty") continue;
      const personKey = entry.mode === "both" ? "both" : person;
      if (app.eatenMap[`${day}:${slot}:${personKey}`]) set.add(`${slot}:${personKey}`);
    }
    return { full, ...eatenTotals(dayPlan, person, set) };
  };

  const r = totalsFor("R");
  const i = totalsFor("I");

  const visibleSlots = SLOTS.filter(slot => !app.sectionHidden(day, slot));
  const hiddenSlots = SLOTS.filter(slot => app.sectionHidden(day, slot));
  const hasAnyMeal = visibleSlots.some(slot => dayPlan[slot].mode !== "empty");

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

  const performMove = async (fromSlot, toSlot) => {
    if (!fromSlot || !toSlot || fromSlot === toSlot) return;
    const wasOccupied = dayPlan[toSlot]?.mode !== "empty";
    try {
      await app.moveSlot(day, fromSlot, toSlot);
      app.notify(interpolate(wasOccupied ? t.swappedWith : t.movedTo, { slot: SLOT_META[toSlot][lang] }));
    } catch {
      // handled by the hook
    }
  };

  const startDrag = (event, slot) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY };
    dragRef.current = { slot, start, active: false, hover: null, x: start.x, y: start.y };
    setDrag({ slot, active: false, hover: null, x: start.x, y: start.y });
  };

  // Tapping the handle without dragging opens the slot picker instead. On a
  // phone that is the reliable way to move a meal out of view: no finger
  // gymnastics, and it works however long the day is.

  const openMove = slot => setMove({ slot });

  useEffect(() => {
    if (!drag) return undefined;

    // Whatever is under the finger. Falls back to the nearest card, because the
    // sticky header and the 9px gaps between cards return no slot at all —
    // which used to make a drop silently do nothing.
    const slotAt = event => {
      const element = document.elementFromPoint?.(event.clientX, event.clientY);
      const direct = element?.closest?.("[data-drop-slot]")?.getAttribute("data-drop-slot");
      if (direct) return direct;
      let best = null;
      document.querySelectorAll("[data-drop-slot]").forEach(zone => {
        const rect = zone.getBoundingClientRect();
        const dx = Math.max(rect.left - event.clientX, event.clientX - rect.right, 0);
        const dy = Math.max(rect.top - event.clientY, event.clientY - rect.bottom, 0);
        const distance = Math.hypot(dx, dy);
        if (distance <= 44 && (!best || distance < best.distance)) {
          best = { slot: zone.getAttribute("data-drop-slot"), distance };
        }
      });
      return best?.slot || null;
    };

    const onMove = event => {
      const state = dragRef.current;
      if (!state) return;
      const distance = Math.hypot(event.clientX - state.start.x, event.clientY - state.start.y);
      if (!state.active && distance < 8) return;
      state.active = true;
      state.x = event.clientX;
      state.y = event.clientY;
      const hover = slotAt(event);
      state.hover = hover;
      setDrag(previous => (previous ? { ...previous, active: true, hover, x: event.clientX, y: event.clientY } : previous));
    };

    // A phone screen fits about one card, so without this you could only ever
    // drop onto the slot you started from. Running off the top or bottom edge
    // scrolls the page while the finger stays down.
    const EDGE = 110;
    let frame = 0;
    let last = 0;
    const autoScroll = time => {
      frame = requestAnimationFrame(autoScroll);
      const state = dragRef.current;
      if (!state?.active || time - last < 16) return;
      last = time;
      const viewport = window.innerHeight || 0;
      let delta = 0;
      if (state.y < EDGE) delta = -Math.ceil((EDGE - state.y) / 5);
      else if (state.y > viewport - EDGE) delta = Math.ceil((state.y - (viewport - EDGE)) / 5);
      if (!delta) return;
      const before = window.scrollY;
      window.scrollBy(0, Math.max(-40, Math.min(40, delta)));
      if (window.scrollY === before) return;
      const hover = slotAt({ clientX: state.x, clientY: state.y });
      state.hover = hover;
      setDrag(previous => (previous ? { ...previous, active: true, hover } : previous));
    };

    const onUp = event => {
      const state = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!state) return;
      if (!state.active) {
        openMove(state.slot);
        return;
      }
      const target = state.hover || slotAt(event);
      if (target && target !== state.slot) performMove(state.slot, target);
    };

    const onCancel = () => {
      dragRef.current = null;
      setDrag(null);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    // The header sits on top of the list and would eat every drop near the top.
    document.body.classList.add("is-dragging-meal");
    frame = requestAnimationFrame(autoScroll);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      document.body.classList.remove("is-dragging-meal");
      cancelAnimationFrame(frame);
    };
    // The listeners only need to follow the slot being dragged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.slot]);

  const confirmHide = async () => {
    if (!hide) return;
    const slot = hide;
    setHide(null);
    try {
      await app.hideSection(day, slot);
      app.notify(t.hiddenSection);
    } catch {
      // handled by the hook
    }
  };

  const restoreSection = async slot => {
    try {
      await app.showSection(day, slot);
      app.notify(interpolate(t.sectionRestored, { slot: SLOT_META[slot][lang] }));
      if (hiddenSlots.length <= 1) setSectionsOpen(false);
    } catch {
      // handled by the hook
    }
  };

  const dateLabel = (() => {
    const date = dayDate(app.weekStart, day);
    return date.toLocaleDateString(lang === "lt" ? "lt-LT" : "en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  })();

  // `person` is null for a shared meal, "R"/"I" for one half of a split slot.
  const cardProps = (slot, person = null) => {
    const entry = dayPlan[slot];
    const recipe = person ? entry.recipes[person] : entry.recipes.R;
    const color = person ? (person === "R" ? C.R : C.I) : C.leaf;
    const key = person || "both";
    return {
      meal: recipe,
      slotLabel: SLOT_META[slot][lang],
      personKey: key,
      personName: person ? peopleNames[person] : null,
      personColor: person ? color : null,
      labels: app.labels,
      lang,
      t,
      eaten: !!app.eatenMap[`${day}:${slot}:${key}`],
      note: mealNote(recipe.id, key),
      onToggleEaten: () => app.toggleEaten(day, slot, key, recipe),
      onOpenRecipe: () => onOpenRecipe(recipe, { day, slot, mode: person ? "split" : "both", person }),
      onChange: () => onPick({ day, slot, mode: person ? "split" : "both", person }),
      onSplit: person ? undefined : () => app.setSplit(day, slot, recipe),
      onMerge: person ? () => requestMerge(slot) : undefined,
      onMove: () => openMove(slot),
      onDragStart: event => startDrag(event, slot),
      onRemove: () => setRemove({ slot, personKey: key }),
      onNoteChange: saveNote(recipe.id, key),
    };
  };

  return (
    <div className={`fade-in ${drag?.active ? "is-dragging" : ""}`}>
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
          const filled = SLOTS.some(slot => !app.sectionHidden(index, slot) && app.plan[index]?.[slot]?.mode !== "empty");
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
        <div className="card card-pad" style={{ marginBottom: 14, background: "linear-gradient(150deg, var(--surface-soft), var(--sage-soft))" }}>
          <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
            <span style={{ fontSize: 26 }} aria-hidden="true">🍽️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--display)", fontSize: 16 }}>{t.emptyDayTitle}</div>
              <p className="caption" style={{ margin: "4px 0 10px" }}>{t.emptyDayBody}</p>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => onPick({ day, slot: visibleSlots[0] || "breakfast", mode: "empty", person: null })}>
                  + {t.chooseRecipe}
                </button>
                <button type="button" className="btn btn-sm btn-soft" onClick={() => onOpenMenu(day)}>🍱 {t.menuTitle}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {visibleSlots.map(slot => {
        const entry = dayPlan[slot];
        const dropClass = `${drag ? "drop-target" : ""} ${drag?.hover === slot && drag.slot !== slot ? "drop-hover" : ""}`;

        if (entry.mode === "empty") {
          return (
            <div
              key={slot}
              data-drop-slot={slot}
              className={`slot-zone ${dropClass}`}
              style={{ marginBottom: 9 }}
            >
              <SlotHead slot={slot} lang={lang} t={t} onHide={() => setHide(slot)} />
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
            <div key={slot} data-drop-slot={slot} className={`slot-zone ${dropClass}`} style={{ marginBottom: 9 }}>
              <SlotHead
                slot={slot}
                lang={lang}
                t={t}
                onHide={() => setHide(slot)}
                extra={<span className="tiny">{t.sameForBoth}</span>}
              />
              <MealCard {...cardProps(slot)} />
            </div>
          );
        }

        return (
          <div key={slot} data-drop-slot={slot} className={`slot-zone ${dropClass}`} style={{ marginBottom: 9 }}>
            <SlotHead
              slot={slot}
              lang={lang}
              t={t}
              onHide={() => setHide(slot)}
              extra={(
                <button type="button" className="btn btn-xs btn-ghost" onClick={() => requestMerge(slot)} style={{ color: C.amber }}>
                  ⇄ {t.mergeShort}
                </button>
              )}
            />
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
              return <MealCard key={person} {...cardProps(slot, person)} />;
            })}
          </div>
        );
      })}

      {hiddenSlots.length > 0 && (
        <button type="button" className="add-section" onClick={() => setSectionsOpen(true)}>
          <span aria-hidden="true">＋</span> {t.addSection}
        </button>
      )}

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

      <ConfirmDialog
        open={!!hide}
        title={t.hideSection}
        body={t.hideSectionConfirm}
        confirmLabel={t.hideSection}
        cancelLabel={t.cancel}
        onClose={() => setHide(null)}
        onConfirm={confirmHide}
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

      <Modal
        open={!!move}
        onClose={() => setMove(null)}
        title={t.moveTitle}
        subtitle={t.moveHint}
        footer={<button type="button" className="btn btn-soft btn-block" onClick={() => setMove(null)}>{t.cancel}</button>}
      >
        {move && (
          <div className="stack">
            {visibleSlots.filter(slot => slot !== move.slot).map(slot => {
              const entry = dayPlan[slot];
              const meal = entry.mode === "both" ? entry.recipes.R : (entry.recipes.R || entry.recipes.I);
              return (
                <button
                  key={slot}
                  type="button"
                  className="recipe-option"
                  onClick={() => { performMove(move.slot, slot); setMove(null); }}
                >
                  <span className="opt-emoji">{meal?.emoji || SLOT_META[slot].icon}</span>
                  <span style={{ flex: 1 }}>
                    <span className="opt-name">{SLOT_META[slot][lang]}</span>
                    <span className="opt-meta">
                      {entry.mode === "empty" ? <span>{t.dropHere}</span> : <span>{meal?.name?.[lang] || meal?.name?.en}</span>}
                    </span>
                  </span>
                  <span style={{ color: C.muted }}>›</span>
                </button>
              );
            })}
          </div>
        )}
      </Modal>

      <Modal
        open={sectionsOpen}
        onClose={() => setSectionsOpen(false)}
        title={t.addSectionTitle}
        subtitle={t.addSectionBody}
        footer={<button type="button" className="btn btn-soft btn-block" onClick={() => setSectionsOpen(false)}>{t.close}</button>}
      >
        {hiddenSlots.length ? (
          <div className="stack">
            {hiddenSlots.map(slot => (
              <button key={slot} type="button" className="recipe-option" onClick={() => restoreSection(slot)}>
                <span className="opt-emoji">{SLOT_META[slot].icon}</span>
                <span style={{ flex: 1 }}>
                  <span className="opt-name">{SLOT_META[slot][lang]}</span>
                </span>
                <span className="tiny" style={{ color: C.leaf, fontWeight: 700 }}>＋ {t.restoreSection}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="caption">{t.allSectionsVisible}</p>
        )}
      </Modal>

      {drag?.active && (
        <div
          className="drag-ghost"
          style={{ left: drag.x, top: drag.y }}
          aria-hidden="true"
        >
          ✥ {drag.hover ? `${t.moveTo}: ${SLOT_META[drag.hover][lang]}` : t.moveMeal}
        </div>
      )}

      <p className="tiny" style={{ textAlign: "center", marginTop: 14 }}>
        {interpolate(t.dayProgress, { done: r.eatenMeals + i.eatenMeals, total: r.meals + i.meals })}
      </p>
    </div>
  );
}
