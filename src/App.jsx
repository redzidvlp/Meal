import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

// Import your split files!
import { P, S, FONT } from "./theme";
import { T, VARIANTS, TIPS, SLOTS, getMeal, fmtNum } from "./data";
import { AuthScreen, RecipeModal, SwapMealModal, VariantPicker, MealCard, WaterTracker } from "./components";

export default function App() {
  const [lang, setLang] = useState("en");
  const [tab, setTab] = useState("plan");
  const [day, setDay] = useState(0);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Shared DB state
  const [plan, setPlanState] = useState({});
  const [notes, setNotesState] = useState({});
  const [eatenSt, setEatenSt] = useState({});
  const [waterSt, setWaterSt] = useState({});
  const [swaps, setSwapsState] = useState({});

  // UI state
  const [picker, setPicker] = useState(false);
  const [recipe, setRecipe] = useState(null);
  const [swapModal, setSwapModal] = useState(null);
  const [tipOpen, setTipOpen] = useState(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [servings, setServings] = useState(2);
  const [shopDays, setShopDays] = useState(new Set([0, 1, 2, 3, 4]));
  const [shopChecked, setShopChecked] = useState({});
  const [shopExp, setShopExp] = useState({});

  const t = T[lang];
  const viewAs = profile?.person_key || "R";
  const hid = profile?.household_id;
  const selVariant = VARIANTS.find(v => v.id === plan[day]);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setLoadingAuth(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null); return; }
    supabase.from("profiles").select("*").eq("id", session.user.id).single().then(({ data }) => setProfile(data));
  }, [session]);

  // ── Load all data ─────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!hid) return;
    const [pR, nR, eR, wR, sR] = await Promise.all([
      supabase.from("plan").select("*").eq("household_id", hid),
      supabase.from("meal_notes").select("*").eq("household_id", hid),
      supabase.from("eaten").select("*").eq("household_id", hid),
      supabase.from("water").select("*").eq("household_id", hid),
      supabase.from("meal_swaps").select("*").eq("household_id", hid),
    ]);
    const p = {}; (pR.data || []).forEach(r => { p[r.day_index] = r.variant_id; }); setPlanState(p);
    const n = {}; (nR.data || []).forEach(r => { n[`${r.day_index}-${r.slot}-${r.person_key}`] = r.note; }); setNotesState(n);
    const e = {}; (eR.data || []).forEach(r => { if (r.eaten) e[`${r.day_index}-${r.slot}-${r.person_key}`] = true; }); setEatenSt(e);
    const w = {}; (wR.data || []).forEach(r => { w[`${r.day_index}-${r.person_key}`] = r.ml; }); setWaterSt(w);
    const sw = {}; (sR.data || []).forEach(r => { sw[`${r.day_index}-${r.slot}-${r.person_key}`] = JSON.parse(r.meal_json); }); setSwapsState(sw);
  }, [hid]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Real-time ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hid) return;
    const ch = supabase.channel("hh-" + hid)
      .on("postgres_changes", { event: "*", schema: "public", table: "plan", filter: `household_id=eq.${hid}` }, p => {
        if (p.eventType === "DELETE") setPlanState(prev => { const n = { ...prev }; delete n[p.old.day_index]; return n; });
        else setPlanState(prev => ({ ...prev, [p.new.day_index]: p.new.variant_id }));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "meal_notes", filter: `household_id=eq.${hid}` }, p => {
        if (p.new) setNotesState(prev => ({ ...prev, [`${p.new.day_index}-${p.new.slot}-${p.new.person_key}`]: p.new.note }));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "eaten", filter: `household_id=eq.${hid}` }, p => {
        if (p.new) setEatenSt(prev => ({ ...prev, [`${p.new.day_index}-${p.new.slot}-${p.new.person_key}`]: p.new.eaten }));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "water", filter: `household_id=eq.${hid}` }, p => {
        if (p.new) setWaterSt(prev => ({ ...prev, [`${p.new.day_index}-${p.new.person_key}`]: p.new.ml }));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "meal_swaps", filter: `household_id=eq.${hid}` }, p => {
        if (p.new) setSwapsState(prev => ({ ...prev, [`${p.new.day_index}-${p.new.slot}-${p.new.person_key}`]: JSON.parse(p.new.meal_json) }));
        if (p.eventType === "DELETE") setSwapsState(prev => { const n = { ...prev }; delete n[`${p.old.day_index}-${p.old.slot}-${p.old.person_key}`]; return n; });
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [hid]);

  // ── Write helpers ─────────────────────────────────────────────────────────
  const uid = session?.user?.id;

  const dbPlan = async (dayIdx, variantId) => {
    setPlanState(p => { const n = { ...p }; if (!variantId) delete n[dayIdx]; else n[dayIdx] = variantId; return n; });
    if (!variantId) await supabase.from("plan").delete().eq("household_id", hid).eq("day_index", dayIdx);
    else await supabase.from("plan").upsert({ household_id: hid, day_index: dayIdx, variant_id: variantId, updated_by: uid }, { onConflict: "household_id,day_index" });
  };

  const dbNote = async (dayIdx, slot, person, val) => {
    const variantId = plan[dayIdx];
    const key = `${variantId}-${slot}-${person}`;

    setNotesState(p => ({ ...p, [key]: val }));
    await supabase.from("meal_notes").upsert(
      { household_id: hid, day_index: variantId, slot, person_key: person, note: val, updated_by: uid },
      { onConflict: "household_id,day_index,slot,person_key" }
    );
  };

  const dbEaten = async (dayIdx, slot, person) => {
    const key = `${dayIdx}-${slot}-${person}`, newVal = !eatenSt[key];
    setEatenSt(p => ({ ...p, [key]: newVal }));
    await supabase.from("eaten").upsert({ household_id: hid, day_index: dayIdx, slot, person_key: person, eaten: newVal }, { onConflict: "household_id,day_index,slot,person_key" });
  };

  const dbWater = async (dayIdx, person, ml) => {
    setWaterSt(p => ({ ...p, [`${dayIdx}-${person}`]: ml }));
    await supabase.from("water").upsert({ household_id: hid, day_index: dayIdx, person_key: person, ml }, { onConflict: "household_id,day_index,person_key" });
  };

  const dbSwap = async (dayIdx, slot, person, meal) => {
    const key = `${dayIdx}-${slot}-${person}`;
    setSwapsState(p => ({ ...p, [key]: meal }));
    await supabase.from("meal_swaps").upsert({ household_id: hid, day_index: dayIdx, slot, person_key: person, meal_json: JSON.stringify(meal) }, { onConflict: "household_id,day_index,slot,person_key" });
  };

  const dbResetWeek = async () => {
    await Promise.all([
      supabase.from("plan").delete().eq("household_id", hid),
      supabase.from("eaten").delete().eq("household_id", hid),
      supabase.from("meal_swaps").delete().eq("household_id", hid),
    ]);
    setPlanState({}); setEatenSt({}); setSwapsState({});
    setResetConfirm(false); setDay(0);
  };

  // ── Resolved meal (considers swaps) ───────────────────────────────────────
  const getResolvedMeal = (variant, slot, person) => {
    const swapKey = `${day}-${slot}-${person}`;
    const swapKeyBoth = `${day}-${slot}-both`;
    return swaps[swapKey] || swaps[swapKeyBoth] || getMeal(variant, slot, person);
  };

  // ── Computed totals ───────────────────────────────────────────────────────
  const getTotals = (variant, person) => {
    if (!variant) return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    return SLOTS.reduce((a, slot) => {
      const m = getResolvedMeal(variant, slot, person);
      if (m) { a.kcal += m.kcal; a.protein += m.protein; a.carbs += m.carbs; a.fat += m.fat; }
      return a;
    }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  };

  const getEatenTotals = (variant, person) => {
    if (!variant) return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    return SLOTS.reduce((a, slot) => {
      const m = getResolvedMeal(variant, slot, person);
      const mR = getMeal(variant, slot, "R"), mI = getMeal(variant, slot, "I");
      const pk = mR === mI ? "both" : person;
      if (m && eatenSt[`${day}-${slot}-${pk}`]) { a.kcal += m.kcal; a.protein += m.protein; a.carbs += m.carbs; a.fat += m.fat; }
      return a;
    }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  };

  // ── Shopping list ─────────────────────────────────────────────────────────
  const shopList = (() => {
    const map = {};
    Array.from(shopDays).forEach(di => {
      const v = VARIANTS.find(x => x.id === plan[di]); if (!v) return;
      SLOTS.forEach(slot => {
        const done = new Set();
        ["R", "I"].forEach(p => {
          const m = getMeal(v, slot, p); if (!m) return;
          if (done.has(m.name.en)) return; done.add(m.name.en);
          m.ing.forEach(ing => {
            const key = lang === "lt" ? ing.lt : ing.en;
            if (!map[key]) map[key] = { unit: ing.unit, total: 0, sources: [] };
            map[key].total += ing.amount * servings;
            map[key].sources.push({ emoji: m.emoji, mealName: m.name[lang], day: t.days[di], amount: ing.amount * servings });
          });
        });
      });
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  })();

  const myWater = waterSt[`${day}-${viewAs}`] || 0;
  const otherKey = viewAs === "R" ? "I" : "R";
  const otherWater = waterSt[`${day}-${otherKey}`] || 0;

  // ── Early returns ─────────────────────────────────────────────────────────
  if (loadingAuth) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: P.bg, ...S.serif(18), color: P.muted }}>Loading…</div>;
  if (!session) return <AuthScreen lang={lang} t={t} />;
  if (!profile) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: P.bg, padding: 24 }}>
      <div style={{ ...S.card, borderRadius: 16, padding: 28, maxWidth: 360, textAlign: "center" }}>
        <div style={{ ...S.serif(18), marginBottom: 12 }}>Account setup needed</div>
        <p style={{ ...S.sans(13, P.muted), lineHeight: 1.7, marginBottom: 16 }}>Your account hasn't been linked to a household yet.<br />Please follow the steps in <strong>supabase_setup.sql</strong>.</p>
        <button onClick={() => supabase.auth.signOut()} style={{ background: P.accent, border: "none", borderRadius: 10, padding: "10px 20px", color: "white", ...S.sans(13), cursor: "pointer" }}>Sign out</button>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{FONT}</style>
      <style>{`*{box-sizing:border-box;}body{margin:0;background:${P.bg};}::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:${P.border};border-radius:2px;}input[type=range]{-webkit-appearance:none;height:6px;border-radius:3px;outline:none;background:${P.border};}input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:${P.R};cursor:pointer;border:2px solid white;box-shadow:0 1px 4px #0002;}`}</style>

      {recipe && <RecipeModal meal={recipe} lang={lang} t={t} onClose={() => setRecipe(null)} />}
      {picker && <VariantPicker lang={lang} t={t} selectedId={plan[day]} onSelect={id => dbPlan(day, id || null)} onClose={() => setPicker(false)} />}
      {swapModal && <SwapMealModal {...swapModal} lang={lang} t={t}
        onSwap={meal => dbSwap(day, swapModal.slot, swapModal.person, meal)}
        onClose={() => setSwapModal(null)} />}

      {/* Week reset confirmation overlay */}
      {resetConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "#00000060", zIndex: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ ...S.card, borderRadius: 20, padding: "28px 24px", maxWidth: 340, width: "100%", boxShadow: "0 16px 48px #00000025", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗓️</div>
            <div style={{ ...S.serif(17), marginBottom: 10 }}>{t.resetWeek}</div>
            <p style={{ ...S.sans(13, P.muted), lineHeight: 1.65, marginBottom: 20 }}>{t.resetConfirm}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setResetConfirm(false)} style={{ flex: 1, background: P.light, border: `1.5px solid ${P.border}`, borderRadius: 10, padding: "10px", ...S.sans(13, P.muted), cursor: "pointer", fontWeight: 600 }}>{t.resetNo}</button>
              <button onClick={dbResetWeek} style={{ flex: 1, background: P.R, border: "none", borderRadius: 10, padding: "10px", ...S.sans(13), color: "white", cursor: "pointer", fontWeight: 600 }}>{t.resetYes}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 440, margin: "0 auto", minHeight: "100vh", background: P.bg, display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ background: "linear-gradient(150deg,#261E13 0%,#483A28 100%)", padding: "16px 20px 0", position: "sticky", top: 0, zIndex: 200 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Baked-in Image Fix! */}
              <img src="/chef-transparent.png" alt="" style={{ width: 32, height: 32, imageRendering: "pixelated", borderRadius: 6 }} />
              <div>
                <div style={{ fontFamily: "'Caveat',cursive", fontSize: 11, color: "#C8A882", letterSpacing: 1.5 }}>{t.subtitle}</div>
                <h1 style={{ margin: 0, ...S.serif(18, 300), color: "#FFF8EC" }}>{t.title}</h1>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <button onClick={() => setLang(l => l === "en" ? "lt" : "en")} style={{ background: "#ffffff18", border: "1px solid #ffffff30", borderRadius: 8, color: "#FFF8EC", fontSize: 11, fontWeight: 700, padding: "4px 8px", cursor: "pointer" }}>{lang === "en" ? "LT" : "EN"}</button>
              <button onClick={() => setResetConfirm(true)} title={t.resetWeek} style={{ background: "#ffffff18", border: "1px solid #ffffff30", borderRadius: 8, color: "#FFF8EC", fontSize: 11, padding: "4px 8px", cursor: "pointer" }}>🗓️</button>
              <button onClick={() => supabase.auth.signOut()} title={t.signOut} style={{ background: "#ffffff18", border: "1px solid #ffffff30", borderRadius: 8, color: "#FFF8EC", fontSize: 11, padding: "4px 8px", cursor: "pointer" }}>↪</button>
              <div style={{ display: "flex" }}>
                {[["R", t.names.R, P.R], ["I", t.names.I, P.I]].map(([k, name, col], i) => (
                  <div key={k} title={name} style={{ width: 26, height: 26, borderRadius: "50%", background: col, border: viewAs === k ? "2px solid white" : "2px solid #261E13", marginLeft: i > 0 ? -7 : 0, display: "flex", alignItems: "center", justifyContent: "center", ...S.sans(11), fontWeight: 700, color: "white" }}>{k}</div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 2, marginTop: 12 }}>
            {[{ id: "plan", icon: "📅", label: t.plan }, { id: "shopping", icon: "🛒", label: t.shopping }, { id: "tips", icon: "💡", label: t.tips }].map(item => (
              <button key={item.id} onClick={() => setTab(item.id)} style={{
                flex: 1, padding: "7px 4px", borderRadius: "10px 10px 0 0", border: "none",
                background: tab === item.id ? P.bg : "transparent",
                // Using a bright, semi-transparent white for inactive tabs so they are highly visible!
                color: tab === item.id ? P.text : "rgba(255, 255, 255, 0.6)",
                fontWeight: 600, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontFamily: "'DM Sans'"
              }}>
                <span style={{ fontSize: 12 }}>{item.icon}</span>{item.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── PLAN ── */}
        {tab === "plan" && (
          <div style={{ flex: 1, padding: "16px", overflowY: "auto" }}>
            {/* Day strip */}
            <div style={{ display: "flex", gap: 4, justifyContent: "space-between", marginBottom: 14, overflowX: "auto", paddingBottom: 2 }}>
              {t.days.map((d, i) => {
                const has = !!plan[i];
                return <button key={d} onClick={() => setDay(i)} style={{
                  flex: 1, /* This forces them to stretch! */
                  padding: "5px 0", /* Adjusted padding so they fit nicely */
                  borderRadius: 9, border: day === i ? `2px solid ${P.accent}` : `1.5px solid ${P.border}`,
                  background: day === i ? P.accent : has ? P.light : "white", color: day === i ? "white" : P.text,
                  fontWeight: 700, fontSize: 11, cursor: "pointer", position: "relative", ...S.sans(11)
                }}>
                  {d}{has && day !== i && <span style={{ position: "absolute", top: -3, right: -3, width: 7, height: 7, background: P.green, borderRadius: "50%", border: "1.5px solid white" }} />}
                </button>;
              })}
            </div>

            {/* Day header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: "'Caveat',cursive", fontSize: 21, color: P.amber }}>{t.fullDays[day]}</div>
                {selVariant && <div style={{ ...S.sans(11, P.muted), marginTop: 1 }}>{selVariant.label[lang]}{selVariant.diff && <span style={{ color: P.amber, marginLeft: 5 }}>⚠️</span>}</div>}
              </div>
              <button onClick={() => setPicker(true)} style={{ ...S.btn(selVariant ? P.light : P.green, selVariant ? P.accent : "white", selVariant ? P.border : P.green) }}>
                {selVariant ? t.changeVariant : `+ ${t.selectVariant}`}
              </button>
            </div>

            {!selVariant ? (
              <div style={{ textAlign: "center", padding: "50px 0", ...S.serif(15), color: P.muted, fontStyle: "italic" }}>{t.noVariant}</div>
            ) : (
              <>
                {/* Day totals */}
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  {[["R", P.R], ["I", P.I]].map(([person, col]) => {
                    const tot = getTotals(selVariant, person), et = getEatenTotals(selVariant, person);
                    const pct = tot.kcal > 0 ? Math.round((et.kcal / tot.kcal) * 100) : 0;
                    return (
                      <div key={person} style={{ flex: 1, background: col + "15", border: `1px solid ${col}30`, borderRadius: 12, padding: "9px 12px" }}>
                        <div style={{ ...S.sans(10, col), fontWeight: 700, marginBottom: 2 }}>{t.names[person]} — {t.dailyTotal}</div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                          <span style={{ ...S.sans(15), fontWeight: 700 }}>{tot.kcal}</span>
                          <span style={{ ...S.sans(10, P.muted) }}>{t.kcal}</span>
                          {et.kcal > 0 && <span style={{ ...S.sans(10, P.green), marginLeft: 2 }}>✓{et.kcal}</span>}
                        </div>
                        {et.kcal > 0 && <div style={{ height: 4, background: P.border, borderRadius: 2, margin: "4px 0", overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: P.green, borderRadius: 2, transition: "width .3s" }} /></div>}
                        <div style={{ display: "flex", gap: 5, marginTop: 2, flexWrap: "wrap" }}>
                          {[["💪", tot.protein, et.protein], ["🌾", tot.carbs, et.carbs], ["🫒", tot.fat, et.fat]].map(([ic, total, eatN]) => (
                            <div key={ic} style={{ ...S.sans(10, P.muted) }}>{ic} {et.kcal > 0 && <span style={{ color: P.green, fontWeight: 700 }}>{eatN}/</span>}{total}g</div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Water */}
                <WaterTracker t={t} myWater={myWater} otherWater={otherWater} otherName={t.names[otherKey]} onMyChange={ml => dbWater(day, viewAs, ml)} />

                {/* Meals */}
                {SLOTS.map(slot => {
                  const mR = getMeal(selVariant, slot, "R"), mI = getMeal(selVariant, slot, "I"), same = mR === mI;
                  if (same && mR) {
                    const person = "both";
                    const eatKey = `${day}-${slot}-${person}`; // Eaten/Swaps stay on the specific day
                    const noteKey = `${selVariant.id}-${slot}-${person}`; // Notes follow the specific recipe
                    const meal = swaps[eatKey] || mR;

                    return <MealCard key={slot} meal={meal} slotLabel={t[slot]} lang={lang} t={t}
                      eaten={!!eatenSt[eatKey]} onToggleEaten={() => dbEaten(day, slot, person)}
                      note={notes[noteKey]} onNoteChange={v => dbNote(day, slot, person, v)}
                      onViewRecipe={setRecipe} onSwap={() => setSwapModal({ slot, person, currentMeal: meal })} />;
                  }
                  return (
                    <div key={slot}>
                      {selVariant.diff && <div style={{ ...S.label, color: P.amber, marginBottom: 4, marginTop: 4 }}>{t[slot]} — {t.diffNote}</div>}
                      {[["R", mR, P.R], ["I", mI, P.I]].filter(([, m]) => m).map(([person, baseMeal, col]) => {
                        const eatKey = `${day}-${slot}-${person}`;
                        const noteKey = `${selVariant.id}-${slot}-${person}`; // Notes follow the specific recipe
                        const meal = swaps[eatKey] || baseMeal;

                        return <MealCard key={person} meal={meal} slotLabel={`${t[slot]} — ${t.names[person]}`} lang={lang} t={t}
                          personColor={col} eaten={!!eatenSt[eatKey]} onToggleEaten={() => dbEaten(day, slot, person)}
                          note={notes[noteKey]} onNoteChange={v => dbNote(day, slot, person, v)}
                          onViewRecipe={setRecipe} onSwap={() => setSwapModal({ slot, person, currentMeal: meal })} />;
                      })}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* ── SHOPPING ── */}
        {tab === "shopping" && (
          <div style={{ flex: 1, padding: "16px", overflowY: "auto" }}>
            <div style={{ ...S.card, borderRadius: 14, padding: "11px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "'Caveat',cursive", fontSize: 16, color: P.accent, flex: 1 }}>{t.servingsFor}</span>
              {[1, 2, 3, 4].map(n => <button key={n} onClick={() => setServings(n)} style={{ width: 32, height: 32, borderRadius: 8, border: servings === n ? `2px solid ${P.accent}` : `1.5px solid ${P.border}`, background: servings === n ? P.accent : "white", color: servings === n ? "white" : P.text, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{n}</button>)}
              <span style={{ ...S.sans(11, P.green) }}>{servings === 1 ? t.person : t.people}</span>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ ...S.label, marginBottom: 6 }}>{t.selectDays}</div>
              <div style={{ display: "flex", gap: 4, justifyContent: "space-between", overflowX: "auto", paddingBottom: 2 }}>
                {t.days.map((d, i) => {
                  const has = !!plan[i];
                  return <button key={d} onClick={() => setShopDays(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })} style={{
                    flex: 1, padding: "5px 0", borderRadius: 9, /* <-- Added flex: 1 and adjusted padding */
                    border: shopDays.has(i) ? `2px solid ${P.accent}` : `1.5px solid ${P.border}`,
                    background: shopDays.has(i) ? P.accent : has ? P.light : "white",
                    color: shopDays.has(i) ? "white" : has ? P.text : P.muted, ...S.sans(11), fontWeight: 700, cursor: "pointer"
                  }}>{d}</button>;
                })}
              </div>
            </div>
            {shopList.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", ...S.serif(14), color: P.muted, fontStyle: "italic" }}>{t.noMeals}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {shopList.map(([name, data]) => {
                  const isChk = !!shopChecked[name], isExp = !!shopExp[name];
                  return (
                    <div key={name} style={{ ...S.card, borderRadius: 12, overflow: "hidden", opacity: isChk ? .55 : 1, cursor: "pointer", background: isChk ? P.light : P.card }}
                      onClick={() => setShopExp(p => ({ ...p, [name]: !p[name] }))}>
                      <div style={{ display: "flex", alignItems: "center", padding: "10px 12px", gap: 8 }}>
                        <button onClick={e => { e.stopPropagation(); setShopChecked(p => ({ ...p, [name]: !p[name] })); }} style={{ width: 22, height: 22, borderRadius: 6, border: isChk ? "none" : `2px solid ${P.border}`, background: isChk ? P.green : "white", color: "white", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{isChk ? "✓" : ""}</button>
                        <span style={{ ...S.sans(13), flex: 1, textDecoration: isChk ? "line-through" : "none" }}>{name}</span>
                        <span style={{ ...S.sans(13, P.amber), fontWeight: 700, marginRight: 4 }}>{fmtNum(data.total)} {data.unit}</span>
                        <span style={{ color: P.muted, fontSize: 11, display: "inline-block", transform: isExp ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▼</span>
                      </div>
                      {isExp && (
                        <div style={{ borderTop: `1px dashed ${P.border}`, padding: "6px 12px 8px 42px", background: P.light }}>
                          {data.sources.map((s, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", ...S.sans(11, P.text), padding: "2px 0" }}>
                              <span>{s.emoji} {s.mealName} <span style={{ color: P.muted }}>({s.day})</span></span>
                              <span style={{ color: P.accent, fontWeight: 600 }}>{fmtNum(s.amount)} {data.unit}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TIPS ── */}
        {tab === "tips" && (
          <div style={{ flex: 1, padding: "16px", overflowY: "auto" }}>
            <div style={{ background: P.green + "18", border: `1.5px solid ${P.green}40`, borderRadius: 16, padding: "14px 16px", marginBottom: 14 }}>
              <div style={{ ...S.serif(16), color: P.green, marginBottom: 8 }}>🌿 {t.fodmap}</div>
              <p style={{ ...S.sans(12), lineHeight: 1.75, margin: 0 }}>
                {lang === "en" ? "FODMAP = fermentable short-chain carbohydrates (fructose, lactose, fructans, galactans, polyols) found in milk, grains, fruits and vegetables. They often cause bloating, cramping and irregular stools in people with IBS or related gut conditions." : "FODMAP = fermentaciją sukeliantys trumpų grandžių angliavandeniai (fruktozė, laktozė, fruktainai, galaktanai, polioliai), randami pieno produktuose, grūduose, vaisiuose ir daržovėse. Jie dažnai sukelia pilvo pūtimą, spazmus ir nereguliarius tuštinimosi sutrikimus."}
              </p>
              <div style={{ marginTop: 10, ...S.sans(12), lineHeight: 1.7 }}>
                <strong>{lang === "en" ? "3 phases:" : "3 etapai:"}</strong><br />
                {lang === "en" ? "① Elimination (6–8 weeks) ② Reintroduction — one food group per week, monitor symptoms ③ Personalisation — long-term plan based on tolerance" : "① Eliminavimas (6–8 sav.) ② Reintrodukcija — po vieną produktų grupę per savaitę ③ Personalizavimas — ilgalaikis planas pagal toleravimą"}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {TIPS[lang].map((tip, i) => {
                const open = tipOpen === i;
                return (
                  <div key={i} style={{ ...S.card, border: `1.5px solid ${open ? P.accent : P.border}`, borderRadius: 12, overflow: "hidden", cursor: "pointer", transition: "border-color .2s" }}
                    onClick={() => setTipOpen(open ? null : i)}>
                    <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 18 }}>{tip.icon}</span>
                      <span style={{ ...S.serif(14), flex: 1 }}>{tip.title}</span>
                      <span style={{ color: P.muted, fontSize: 12, display: "inline-block", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▼</span>
                    </div>
                    {open && <div style={{ padding: "0 14px 14px 44px" }}><p style={{ ...S.sans(13), lineHeight: 1.85, margin: 0 }}>{tip.body}</p></div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div style={{ height: 20 }} />
      </div>
    </>
  );
}