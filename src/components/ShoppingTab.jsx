import { useEffect, useMemo, useState } from "react";
import { C, SLOT_META } from "../theme.js";
import { fmtNum, interpolate } from "../lib/format.js";
import { Chip, EmptyState, PersonBadge } from "./ui.jsx";

const defaultThreshold = (total, unit) => {
  const base = Math.round(total * 0.2);
  return unit === "vnt" ? Math.max(1, base) : Math.max(25, base);
};

export default function ShoppingTab({ app, lang, t, onGoPantry }) {
  const [days, setDays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [expanded, setExpanded] = useState({});
  const [portionDraft, setPortionDraft] = useState(app.extraPortions);

  useEffect(() => { setPortionDraft(app.extraPortions); }, [app.extraPortions]);

  const items = useMemo(() => app.shoppingList(days, lang), [app, days, lang]);
  const people = useMemo(() => ({
    R: app.people.R || t.personFallback.R,
    I: app.people.I || t.personFallback.I,
  }), [app.people, t]);

  const lowKeys = useMemo(() => new Set(app.lowPantry.map(item => `${item.key}|${item.unit}`)), [app.lowPantry]);
  const checkedItems = items.filter(item => app.checksMap[item.key]);
  const toggleDay = index => setDays(previous => previous.includes(index) ? previous.filter(value => value !== index) : [...previous, index].sort((a, b) => a - b));

  const changePortions = value => {
    const next = Math.max(0, Math.min(8, value));
    setPortionDraft(next);
    app.updateHousehold({ extraPortions: next });
  };

  const stockPayload = item => ({
    key: item.ingredientKey,
    nameEn: item.nameEn,
    nameLt: item.nameLt,
    unit: item.unit,
    quantity: item.total,
    lowThreshold: defaultThreshold(item.total, item.unit),
  });

  const toggleChecked = async item => {
    const checked = !!app.checksMap[item.key];
    try {
      await app.toggleShoppingItem(item.key, !checked);
      if (!checked && !app.pantry.some(entry => `${entry.key}|${entry.unit}` === item.key)) {
        await app.stockPantry([stockPayload(item)]);
      }
    } catch {
      // The hook already showed an error toast.
    }
  };

  const stockOne = async item => {
    try {
      await app.stockPantry([stockPayload(item)]);
      if (!app.checksMap[item.key]) await app.toggleShoppingItem(item.key, true);
    } catch {
      // handled by the hook
    }
  };

  const stockChecked = async () => {
    const source = checkedItems.length ? checkedItems : items;
    if (!source.length) return;
    try {
      await app.stockPantry(source.map(stockPayload));
    } catch {
      // handled by the hook
    }
  };

  return (
    <div className="fade-in">
      <div className="row-between" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="eyebrow">🛒 {t.navShopping}</div>
          <h1 className="page-title">{t.shoppingTitle}</h1>
        </div>
        <span className="chip sage static">{interpolate(t.totalItems, { n: items.length })}</span>
      </div>
      <p className="page-sub">{t.shoppingSub}</p>

      {lowKeys.size > 0 && (
        <button
          type="button"
          className="low-callout"
          onClick={onGoPantry}
          style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
        >
          <b>🥫 {t.lowCalloutTitle}</b><br />
          {t.lowCalloutBody}
          <span style={{ float: "right", color: C.amber, fontWeight: 700 }}>›</span>
        </button>
      )}

      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <div className="eyebrow" style={{ marginBottom: 7 }}>{t.selectDays}</div>
        <div className="day-strip" style={{ marginBottom: 12 }}>
          {t.dayNames.map((name, index) => (
            <button
              key={name}
              type="button"
              className={`day-btn ${days.includes(index) ? "selected" : ""}`}
              onClick={() => toggleDay(index)}
              aria-pressed={days.includes(index)}
            >
              <span>{name}</span>
              <span className="day-num" aria-hidden="true">{days.includes(index) ? "✓" : "·"}</span>
            </button>
          ))}
        </div>
        <div className="row-between">
          <div>
            <div className="eyebrow">{t.extraPortions}</div>
            <div className="tiny">{t.extraPortionsHint}</div>
          </div>
          <div className="stepper">
            <button type="button" onClick={() => changePortions(portionDraft - 1)} aria-label="Decrease">−</button>
            <span className="qty-value" style={{ minWidth: 26 }}>{portionDraft}</span>
            <button type="button" onClick={() => changePortions(portionDraft + 1)} aria-label="Increase">+</button>
          </div>
        </div>
      </div>

      <div className="row-between" style={{ margin: "0 0 8px" }}>
        <span className="tiny">{interpolate(t.shoppingSummary, { items: items.length, checked: checkedItems.length })}</span>
        <div className="row" style={{ gap: 4 }}>
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => app.clearShoppingChecks()} disabled={!checkedItems.length}>{t.clearChecked}</button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState icon="🧺" title={t.noShoppingItems} body={t.noShoppingHint} />
      ) : (
        <>
          <div className="shop-list">
            {items.map(item => {
              const checked = !!app.checksMap[item.key];
              const isOpen = !!expanded[item.key];
              const pantryQty = item.inPantry;
              const low = lowKeys.has(item.key);
              return (
                <div key={item.key}>
                  <div className={`shop-row ${checked ? "checked" : ""}`}>
                    <button
                      type="button"
                      className={`checkbox ${checked ? "checked" : ""}`}
                      onClick={() => toggleChecked(item)}
                      aria-pressed={checked}
                      aria-label={t.checked}
                    >
                      {checked ? "✓" : ""}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpanded(previous => ({ ...previous, [item.key]: !previous[item.key] }))}
                      style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                      aria-expanded={isOpen}
                    >
                      <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>
                        <span className="shop-name">{item.name}</span>
                        {low && <span className="stock-badge" style={{ color: C.amber, borderColor: "#e8d4ac", background: "#fdf8ee" }}>{t.lowStock}</span>}
                        {pantryQty != null && pantryQty > 0 && (
                          <span className="stock-badge">{fmtNum(pantryQty)} {item.unit} {t.inPantry}</span>
                        )}
                      </div>
                      <div className="tiny" style={{ marginTop: 2 }}>
                        {item.sources.length} × {isOpen ? t.sources : "···"}
                      </div>
                    </button>
                    <span className="shop-qty">{fmtNum(item.total)} {item.unit}</span>
                    <button
                      type="button"
                      className="btn btn-xs btn-soft"
                      onClick={() => stockOne(item)}
                      title={t.addToPantry}
                      aria-label={t.addToPantry}
                      style={{ padding: "4px 7px" }}
                    >
                      🥫
                    </button>
                  </div>
                  {isOpen && (
                    <div className="shop-sources">
                      {item.sources.map((source, index) => (
                        <div key={`${source.recipeId}-${source.day}-${source.slot}-${index}`} className="source-row">
                          <span>
                            {source.emoji} {source.name}
                            <span style={{ color: C.muted }}> · {t.dayNames[source.day]} · {SLOT_META[source.slot]?.[lang]}</span>
                            {source.person !== "both" && (
                              <span style={{ marginLeft: 5 }}>
                                <PersonBadge personKey={source.person} name={people[source.person]} small />
                              </span>
                            )}
                          </span>
                          <span style={{ color: C.amber, fontWeight: 700 }}>{fmtNum(source.amount)} {item.unit}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="stack" style={{ gap: 8, marginTop: 14 }}>
            <button type="button" className="btn btn-primary btn-block" onClick={stockChecked}>
              🥫 {checkedItems.length ? t.addCheckedToPantry : t.addAllToPantry}
            </button>
            <p className="tiny" style={{ textAlign: "center", margin: 0 }}>{t.pantryStockHint}</p>
          </div>
        </>
      )}
    </div>
  );
}
