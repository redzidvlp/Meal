import { useState } from "react";
import { T } from "../data/translations.js";
import { C } from "../theme.js";
import { Field } from "./ui.jsx";
import { isInviteCode, sanitizeInviteCode } from "../lib/validate.js";

function PersonChoice({ t, value, onChange }) {
  return (
    <div className="form-grid" role="radiogroup" aria-label={t.whoAreYou}>
      {[["R", t.personOne, C.R], ["I", t.personTwo, C.I]].map(([key, label, color]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => onChange(key)}
          className="btn"
          style={{
            flexDirection: "column",
            gap: 4,
            padding: "11px 8px",
            borderColor: value === key ? color : C.line,
            background: value === key ? `${color}12` : C.surface,
            color: value === key ? color : C.inkSoft,
            fontWeight: 700,
          }}
        >
          <span style={{ width: 18, height: 18, borderRadius: "50%", background: color, display: "block" }} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

export default function SetupScreen({ lang, setLang, userEmail, onCreate, onJoin, onSignOut }) {
  const t = T[lang];
  const [mode, setMode] = useState("create");
  const [householdName, setHouseholdName] = useState("");
  const [personName, setPersonName] = useState("");
  const [personKey, setPersonKey] = useState("R");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async event => {
    event.preventDefault();
    setError("");
    if (!personName.trim()) { setError(t.yourName); return; }
    if (mode === "join" && !isInviteCode(code)) { setError(t.invalidCode); return; }
    setLoading(true);
    try {
      if (mode === "create") await onCreate(householdName.trim(), personName.trim(), personKey);
      else await onJoin(sanitizeInviteCode(code), personName.trim(), personKey);
    } catch (err) {
      const message = String(err?.message || "").toLowerCase();
      if (message.includes("invalid_code")) setError(t.invalidCode);
      else if (message.includes("person_taken")) setError(t.personTaken);
      else if (message.includes("already_linked")) setError(t.alreadyLinked);
      else setError(t.setupError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card fade-in">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span className="tiny" style={{ maxWidth: 210, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t.signedInAs} {userEmail}
          </span>
          <div className="row" style={{ gap: 4 }}>
            <button type="button" className="icon-btn lang-btn" onClick={() => setLang(lang === "en" ? "lt" : "en")} aria-label="Language">
              {lang === "en" ? "LT" : "EN"}
            </button>
            <button type="button" className="btn btn-ghost btn-xs" onClick={onSignOut}>{t.signOut}</button>
          </div>
        </div>

        <div className="auth-logo" aria-hidden="true">🏡</div>
        <h1 className="auth-title" style={{ fontSize: 24 }}>{t.setupTitle}</h1>
        <p className="auth-sub">{t.setupSub}</p>

        <div className="segmented" style={{ marginBottom: 18 }}>
          <button type="button" className={mode === "create" ? "active" : ""} onClick={() => { setMode("create"); setError(""); }}>
            {t.createHousehold}
          </button>
          <button type="button" className={mode === "join" ? "active" : ""} onClick={() => { setMode("join"); setError(""); }}>
            {t.joinHousehold}
          </button>
        </div>

        <form onSubmit={submit} className="stack" style={{ gap: 13 }}>
          {mode === "create" ? (
            <Field label={t.householdName} hint={t.createNote}>
              <input
                className="input"
                value={householdName}
                onChange={event => setHouseholdName(event.target.value)}
                placeholder={t.householdNamePlaceholder}
                maxLength={80}
              />
            </Field>
          ) : (
            <Field label={t.inviteCode} hint={t.joinNote}>
              <input
                className="input"
                value={code}
                onChange={event => setCode(sanitizeInviteCode(event.target.value))}
                placeholder={t.joinCodePlaceholder}
                maxLength={6}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                style={{ fontFamily: "ui-monospace, monospace", letterSpacing: ".25em", fontWeight: 700 }}
              />
            </Field>
          )}

          <Field label={t.yourName}>
            <input
              className="input"
              value={personName}
              onChange={event => setPersonName(event.target.value)}
              placeholder={t.yourNamePlaceholder}
              maxLength={40}
              autoComplete="given-name"
            />
          </Field>

          <Field label={t.whoAreYou}>
            <PersonChoice t={t} value={personKey} onChange={setPersonKey} />
          </Field>

          {error && <div className="field-error" role="alert">{error}</div>}

          <button type="submit" className="btn btn-primary btn-block" disabled={loading} style={{ padding: 12 }}>
            {loading ? t.saving : (mode === "create" ? t.createBtn : t.joinBtn)}
          </button>
        </form>
      </div>
    </div>
  );
}
