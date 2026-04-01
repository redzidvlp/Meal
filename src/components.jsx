import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase";
import { P, S, FONT } from "./theme";
import { VARIANTS, getMeal, SLOTS } from "./data";

export function AutoTextarea({ value, onChange, placeholder, style }) {
    const ref = useRef(null);
    useEffect(() => {
        if (!ref.current) return;
        ref.current.style.height = "auto";
        ref.current.style.height = ref.current.scrollHeight + "px";
    }, [value]);
    return <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} rows={2} style={{ ...style, resize: "none", overflow: "hidden" }} />;
}

export function AuthScreen({ lang, t }) {
    const [mode, setMode] = useState("signin");
    const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState("");

    const handle = async () => {
        setLoading(true); setError(""); setSuccess("");
        try {
            if (mode === "signin") {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
            } else {
                const { error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;
                setSuccess(lang === "en" ? "Account created! Check your email, then sign in." : "Paskyra sukurta! Patikrinkite el. paštą ir prisijunkite.");
            }
        } catch { setError(t.authError); }
        setLoading(false);
    };

    const inp = { boxSizing: "border-box", border: `1.5px solid ${P.border}`, borderRadius: 10, padding: "10px 14px", fontFamily: "'DM Sans'", fontSize: 14, color: P.text, background: "white", outline: "none", width: "100%" };

    return (
        <div style={{ minHeight: "100vh", background: P.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            {/* Baked-in Font Fix! */}
            <style>{FONT}</style>
            <div style={{ ...S.card, borderRadius: 20, padding: "32px 28px", maxWidth: 360, width: "100%", boxShadow: "0 8px 32px #00000015" }}>
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                    {/* Baked-in Image Fix! */}
                    <img src="/chef-transparent.png" alt="chef" style={{ width: 64, height: 64, imageRendering: "pixelated", marginBottom: 8 }} />
                    <div style={{ ...S.serif(22, 300) }}>Our Meal Plan</div>
                    <div style={{ ...S.sans(11, P.muted), marginTop: 2 }}>low-FODMAP · gluten-free</div>
                </div>
                <div style={{ display: "flex", background: P.light, borderRadius: 10, padding: 3, marginBottom: 20 }}>
                    {["signin", "signup"].map(m => (
                        <button key={m} onClick={() => { setMode(m); setError(""); setSuccess(""); }} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", background: mode === m ? P.card : "transparent", color: mode === m ? P.text : P.muted, fontFamily: "'DM Sans'", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                            {m === "signin" ? t.signIn : t.signUp}
                        </button>
                    ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t.email} style={inp} />
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t.password} onKeyDown={e => e.key === "Enter" && handle()} style={inp} />
                </div>
                {error && <div style={{ ...S.sans(12, P.R), marginBottom: 10, lineHeight: 1.5 }}>{error}</div>}
                {success && <div style={{ ...S.sans(12, P.green), marginBottom: 10, lineHeight: 1.5 }}>{success}</div>}
                <button onClick={handle} disabled={loading} style={{ boxSizing: "border-box", width: "100%", background: P.green, border: "none", borderRadius: 10, padding: "12px", fontFamily: "'DM Sans'", fontSize: 15, fontWeight: 700, color: "white", cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1 }}>
                    {loading ? (mode === "signin" ? t.signingIn : t.signingUp) : (mode === "signin" ? t.signIn : t.signUp)}
                </button>
            </div>
        </div>
    );
}

export function RecipeModal({ meal, lang, t, onClose }) {
    if (!meal) return null;
    return (
        <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#00000060", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ ...S.card, borderRadius: 20, maxWidth: 420, width: "100%", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 20px 60px #00000030" }}>
                <div style={{ padding: "20px 20px 14px", borderBottom: `1px solid ${P.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 34 }}>{meal.emoji}</span>
                        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: P.muted, fontSize: 20, padding: 4 }}>✕</button>
                    </div>
                    <h2 style={{ ...S.serif(18), margin: "8px 0 10px" }}>{meal.name[lang]}</h2>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {[["🔥", meal.kcal, t.kcal], ["💪", meal.protein + "g", t.protein], ["🌾", meal.carbs + "g", t.carbs], ["🫒", meal.fat + "g", t.fat]].map(([ic, val, lbl]) => (
                            <div key={lbl} style={{ background: P.light, borderRadius: 8, padding: "5px 10px", display: "flex", flexDirection: "column", alignItems: "center", minWidth: 56 }}>
                                <span style={{ fontSize: 11 }}>{ic}</span>
                                <span style={{ ...S.sans(13), fontWeight: 700 }}>{val}</span>
                                <span style={{ ...S.sans(9, P.muted) }}>{lbl}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div style={{ padding: "14px 20px 0" }}>
                    <div style={{ ...S.serif(14), color: P.accent, marginBottom: 8 }}>{t.ingredientsTitle}</div>
                    {meal.ing.map((ing, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", ...S.sans(13), padding: "5px 0", borderBottom: `1px dashed ${P.border}` }}>
                            <span>{lang === "lt" ? ing.lt : ing.en}</span>
                            <span style={{ color: P.amber, fontWeight: 600, marginLeft: 8, flexShrink: 0 }}>{ing.amount} {ing.unit}</span>
                        </div>
                    ))}
                </div>
                <div style={{ padding: "14px 20px 20px" }}>
                    <div style={{ ...S.serif(14), color: P.accent, marginBottom: 8 }}>{t.methodTitle}</div>
                    <p style={{ ...S.sans(13), lineHeight: 1.85, margin: 0 }}>{meal.method[lang]}</p>
                </div>
            </div>
        </div>
    );
}

export function SwapMealModal({ slot, person, currentMeal, lang, t, onSwap, onClose }) {
    const seen = new Set();
    const options = VARIANTS.flatMap(v => {
        const m = getMeal(v, slot, person);
        if (!m || seen.has(m.name.en)) return [];
        seen.add(m.name.en);
        return [{ variant: v, meal: m, isCurrent: currentMeal && m.name.en === currentMeal.name.en }];
    });
    return (
        <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#00000060", zIndex: 700, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ ...S.card, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 460, maxHeight: "80vh", overflowY: "auto", padding: "20px 16px 32px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div>
                        <div style={{ ...S.serif(17) }}>{t.swapMeal} — {t[slot]}</div>
                        <div style={{ ...S.sans(11, P.muted), marginTop: 2 }}>{t.swapTitle}</div>
                    </div>
                    <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: P.muted, fontSize: 18 }}>✕</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {options.map(({ variant, meal, isCurrent }) => (
                        <button key={meal.name.en} onClick={() => { if (!isCurrent) { onSwap(meal); onClose(); } }}
                            style={{ background: isCurrent ? P.green + "15" : P.light, border: `1.5px solid ${isCurrent ? P.green : P.border}`, borderRadius: 12, padding: "11px 14px", cursor: isCurrent ? "default" : "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 22, flexShrink: 0 }}>{meal.emoji}</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ ...S.serif(13) }}>{meal.name[lang]}</div>
                                <div style={{ ...S.sans(10, P.muted), marginTop: 2 }}>
                                    {variant.label[lang]} · 🔥{meal.kcal} 💪{meal.protein}g 🌾{meal.carbs}g 🫒{meal.fat}g
                                    {isCurrent && <span style={{ color: P.green, marginLeft: 6 }}>← {t.swapSame}</span>}
                                </div>
                            </div>
                            {!isCurrent && <span style={{ color: P.muted, fontSize: 14, flexShrink: 0 }}>›</span>}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function VariantPicker({ lang, t, selectedId, onSelect, onClose }) {
    const [preview, setPreview] = useState(null);
    const v = preview ? VARIANTS.find(x => x.id === preview) : null;
    return (
        <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#00000055", zIndex: 400, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ ...S.card, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 460, maxHeight: "82vh", overflowY: "auto", padding: "20px 16px 32px" }}>
                {v ? (
                    <>
                        <button onClick={() => setPreview(null)} style={{ background: "none", border: "none", ...S.sans(13, P.muted), cursor: "pointer", padding: 0, marginBottom: 12 }}>← {lang === "en" ? "Back" : "Atgal"}</button>
                        <h3 style={{ ...S.serif(18), margin: "0 0 4px" }}>{v.label[lang]}</h3>
                        <p style={{ ...S.sans(11, P.muted), margin: "0 0 14px" }}>{t.previewTitle}</p>
                        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                            {[["R", P.R], ["I", P.I]].map(([p, col]) => (
                                <div key={p} style={{ flex: 1, background: col + "18", border: `1px solid ${col}30`, borderRadius: 10, padding: "7px 12px" }}>
                                    <div style={{ ...S.sans(10, col), fontWeight: 700 }}>{t.names[p]}</div>
                                    <div style={{ ...S.sans(14), fontWeight: 700 }}>{v.kcal[p]} {t.kcal}</div>
                                </div>
                            ))}
                        </div>
                        {SLOTS.map(slot => {
                            const mR = getMeal(v, slot, "R"), mI = getMeal(v, slot, "I"), same = mR === mI;
                            return (
                                <div key={slot} style={{ marginBottom: 10 }}>
                                    <div style={{ ...S.label, marginBottom: 4 }}>{t[slot]}</div>
                                    {same && mR ? (
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, background: P.light, borderRadius: 10, padding: "8px 12px" }}>
                                            <span style={{ fontSize: 20 }}>{mR.emoji}</span>
                                            <span style={{ ...S.serif(13) }}>{mR.name[lang]}</span>
                                        </div>
                                    ) : (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                            {[["R", mR, P.R], ["I", mI, P.I]].filter(([, m]) => m).map(([p, meal, col]) => (
                                                <div key={p} style={{ display: "flex", alignItems: "center", gap: 8, background: P.light, borderRadius: 10, padding: "7px 12px", borderLeft: `3px solid ${col}` }}>
                                                    <span style={{ fontSize: 18 }}>{meal.emoji}</span>
                                                    <div>
                                                        <div style={{ ...S.sans(10, col), fontWeight: 700 }}>{t.names[p]}</div>
                                                        <div style={{ ...S.serif(13) }}>{meal.name[lang]}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        <button onClick={() => { onSelect(v.id); onClose(); }} style={{ marginTop: 14, width: "100%", background: P.green, border: "none", borderRadius: 12, padding: "13px", ...S.serif(15), color: "white", cursor: "pointer" }}>{t.confirmSelect}</button>
                    </>
                ) : (
                    <>
                        <p style={{ ...S.sans(12, P.muted), margin: "0 0 12px" }}>{lang === "en" ? "Tap a variant to preview its meals" : "Paspauskite variantą, kad peržiūrėtumėte patiekalus"}</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                            {VARIANTS.map(vv => {
                                const sel = selectedId === vv.id;
                                return (
                                    <button key={vv.id} onClick={() => setPreview(vv.id)} style={{ background: sel ? P.green + "20" : P.light, border: sel ? `2px solid ${P.green}` : `1.5px solid ${P.border}`, borderRadius: 12, padding: "11px 14px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ ...S.serif(15) }}>{vv.label[lang]}</div>
                                            <div style={{ ...S.sans(11, P.muted), marginTop: 2 }}>{SLOTS.map(s => getMeal(vv, s, "R")?.emoji).filter(Boolean).join("  ")}{vv.diff && <span style={{ color: P.amber, marginLeft: 8, fontSize: 10 }}>⚠️</span>}</div>
                                        </div>
                                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                                            <div style={{ ...S.sans(10, P.R) }}>{t.names.R}: {vv.kcal.R}</div>
                                            <div style={{ ...S.sans(10, P.I) }}>{t.names.I}: {vv.kcal.I}</div>
                                        </div>
                                        {sel && <span style={{ color: P.green }}>✓</span>}
                                        <span style={{ color: P.muted, fontSize: 14 }}>›</span>
                                    </button>
                                );
                            })}
                            {selectedId && <button onClick={() => { onSelect(null); onClose(); }} style={{ background: "none", border: `1.5px solid ${P.border}`, borderRadius: 12, padding: "9px", ...S.sans(12, P.muted), cursor: "pointer" }}>{t.removeVariant}</button>}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export function MealCard({ meal, slotLabel, lang, t, personColor, eaten, onToggleEaten, note, onNoteChange, onViewRecipe, onSwap }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(note || "");
    useEffect(() => { setDraft(note || ""); }, [note]);
    if (!meal) return null;
    return (
        <div style={{ ...S.card, border: `1.5px solid ${eaten ? P.green + "60" : P.border}`, background: eaten ? P.light : P.card, borderRadius: 14, overflow: "hidden", marginBottom: 8 }}>
            <div style={{ padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ fontSize: 24, lineHeight: 1, marginTop: 2 }}>{meal.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {personColor && <div style={{ height: 3, width: 24, background: personColor, borderRadius: 2, marginBottom: 4 }} />}
                        <div style={{ ...S.label }}>{slotLabel}</div>
                        <div style={{ ...S.serif(14), marginTop: 1, textDecoration: eaten ? "line-through" : "none" }}>{meal.name[lang]}</div>
                        <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                            {[["🔥", meal.kcal + t.kcal], ["💪", meal.protein + "g"], ["🌾", meal.carbs + "g"], ["🫒", meal.fat + "g"]].map(([ic, v]) => (
                                <span key={ic} style={{ ...S.sans(11, P.muted) }}>{ic} {v}</span>
                            ))}
                        </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
                        <button onClick={() => onViewRecipe(meal)} style={{ background: P.light, border: `1px solid ${P.border}`, borderRadius: 8, padding: "4px 9px", cursor: "pointer", ...S.sans(11, P.accent), fontWeight: 600 }}>{t.viewRecipe}</button>
                        <button onClick={onToggleEaten} style={{ background: eaten ? P.green : P.light, border: `1px solid ${eaten ? P.green : P.border}`, borderRadius: 8, padding: "4px 9px", cursor: "pointer", ...S.sans(11, eaten ? "white" : P.muted) }}>
                            {eaten ? "✓ " + t.eaten : t.markEaten}
                        </button>
                        <button onClick={onSwap} style={{ background: P.light, border: `1px solid ${P.border}`, borderRadius: 8, padding: "4px 9px", cursor: "pointer", ...S.sans(11, P.water) }}>⇄ {t.swapMeal}</button>
                    </div>
                </div>
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${P.border}` }}>
                    {editing ? (
                        <div>
                            <AutoTextarea value={draft} onChange={setDraft} placeholder={t.notePlaceholder}
                                style={{ width: "100%", border: `1.5px solid ${P.border}`, borderRadius: 8, padding: "6px 10px", ...S.sans(12), background: P.light, outline: "none", boxSizing: "border-box" }} />
                            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                                <button onClick={() => { onNoteChange(draft); setEditing(false); }} style={{ background: P.green, border: "none", borderRadius: 8, padding: "5px 14px", color: "white", ...S.sans(12), fontWeight: 600, cursor: "pointer" }}>{t.saveNote}</button>
                                <button onClick={() => { setDraft(note || ""); setEditing(false); }} style={{ background: "none", border: `1px solid ${P.border}`, borderRadius: 8, padding: "5px 10px", ...S.sans(12, P.muted), cursor: "pointer" }}>{t.cancelNote}</button>
                            </div>
                        </div>
                    ) : (
                        <div onClick={() => setEditing(true)} style={{ cursor: "pointer" }}>
                            {note ? <div style={{ fontFamily: "'Caveat',cursive", fontSize: 14, color: P.accent, lineHeight: 1.5 }}>📝 {note}</div>
                                : <div style={{ ...S.sans(11, P.muted), fontStyle: "italic" }}>{t.addNote}</div>}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export function WaterTracker({ t, myWater, otherWater, otherName, onMyChange }) {
    const MAX = 2200, GOAL = 1800, goalPct = GOAL / MAX;

    return (
        <div style={{ background: P.water + "10", border: `1.5px solid ${P.water}25`, borderRadius: 14, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ ...S.serif(14), color: P.water }}>💧 {t.water}</div>
                <div style={{ ...S.sans(10, P.muted) }}>{t.waterGoal}</div>
            </div>
            {[["R", myWater, true], [null, otherWater, false]].map(([, val, editable], i) => {
                const isGoal = val >= GOAL;
                const userCol = i === 0 ? P.R : P.I;
                const activeCol = isGoal ? P.green : userCol; // Turns vibrant green when goal reached!

                return (
                    <div key={i} style={{ marginBottom: i === 0 ? 16 : 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ ...S.sans(12, userCol), fontWeight: 700 }}>
                                {i === 0 ? t.names.R : otherName}
                                {!editable && <span style={{ ...S.sans(10, P.muted), fontWeight: 400, marginLeft: 6 }}>(view only)</span>}
                                {isGoal && <span style={{ fontSize: 14, marginLeft: 6 }}>🎉</span>} {/* Celebration Emoji! */}
                            </span>
                            <span style={{ ...S.sans(12, activeCol), fontWeight: 700 }}>{val} ml</span>
                        </div>

                        {/* The Progress Bar */}
                        <div style={{ position: "relative", height: 12, background: P.border, borderRadius: 6, marginBottom: editable ? 10 : 0, overflow: "hidden" }}>
                            <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(val / MAX, 1) * 100}%`, background: activeCol, borderRadius: 6, transition: "width .3s ease-out, background-color .3s" }} />
                            {/* Goal Marker Line */}
                            <div style={{ position: "absolute", left: `${goalPct * 100}%`, top: 0, bottom: 0, width: 2, background: isGoal ? "white" : "#261E1340", opacity: 0.8 }} />
                        </div>

                        {editable && (
                            <>
                                <input type="range" min={0} max={MAX} step={100} value={val} onChange={e => onMyChange(Number(e.target.value))} style={{ width: "100%", height: 4, cursor: "pointer", marginBottom: 8 }} />

                                {/* NEW: Quick Add Buttons! */}
                                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                                    {[250, 500].map(amt => (
                                        <button key={amt} onClick={() => onMyChange(Math.min(val + amt, MAX))}
                                            style={{ flex: 1, background: P.light, border: `1px solid ${P.border}`, borderRadius: 8, padding: "6px", ...S.sans(11, P.water), fontWeight: 700, cursor: "pointer", transition: "transform 0.1s" }}
                                            onMouseDown={e => e.currentTarget.style.transform = "scale(0.95)"}
                                            onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
                                            onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
                                            + {amt} ml 🚰
                                        </button>
                                    ))}
                                    {/* Reset to zero button */}
                                    <button onClick={() => onMyChange(0)}
                                        style={{ width: 36, background: "transparent", border: `1px dashed ${P.border}`, borderRadius: 8, padding: "6px", ...S.sans(11, P.muted), cursor: "pointer" }}>
                                        ↺
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );
}