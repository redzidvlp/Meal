import { useState } from "react";
import { T } from "../data/translations.js";
import { C } from "../theme.js";
import { Field } from "./ui.jsx";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function AuthScreen({ lang, setLang, onSignIn, onSignUp }) {
  const t = T[lang];
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = async event => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!EMAIL_RE.test(email) || email.length > 254) {
      setError(t.email);
      return;
    }
    if (password.length < 8 || password.length > 128) {
      setError(t.weakPassword);
      return;
    }
    setLoading(true);
    try {
      if (mode === "signin") await onSignIn(email.trim().toLowerCase(), password);
      else {
        const result = await onSignUp(email.trim().toLowerCase(), password);
        if (result?.needsConfirmation) setSuccess(t.confirmEmail);
        else setSuccess(t.confirmEmail);
        setPassword("");
      }
    } catch (err) {
      const message = String(err?.message || "").toLowerCase();
      if (message.includes("already registered")) setError(t.signUpError);
      else if (message.includes("invalid login")) setError(t.authError);
      else if (message.includes("email not confirmed")) setError(t.confirmEmail);
      else setError(mode === "signin" ? t.authError : t.signUpError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card fade-in">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: -8 }}>
          <button type="button" className="icon-btn lang-btn" onClick={() => setLang(lang === "en" ? "lt" : "en")} aria-label="Language">
            {lang === "en" ? "LT" : "EN"}
          </button>
        </div>
        <div className="auth-logo" aria-hidden="true">🌿</div>
        <h1 className="auth-title">{t.appName}</h1>
        <p className="auth-sub">{t.authSub}</p>

        <div className="segmented" style={{ marginBottom: 18 }} role="tablist" aria-label={mode}>
          <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "active" : ""} onClick={() => { setMode("signin"); setError(""); setSuccess(""); }}>
            {t.signIn}
          </button>
          <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setError(""); setSuccess(""); }}>
            {t.signUp}
          </button>
        </div>

        <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
          <Field label={t.email}>
            <input
              className="input"
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              maxLength={254}
              required
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <Field label={t.password} hint={t.passwordHint}>
            <div style={{ position: "relative" }}>
              <input
                className="input"
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={8}
                maxLength={128}
                required
                value={password}
                onChange={event => setPassword(event.target.value)}
                style={{ paddingRight: 52 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(value => !value)}
                aria-label={showPassword ? t.hide : t.show}
                style={{
                  position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                  border: "none", background: "transparent", cursor: "pointer",
                  color: C.muted, fontSize: 11, fontWeight: 700, padding: 6,
                }}
              >
                {showPassword ? t.hide.toUpperCase() : t.show.toUpperCase()}
              </button>
            </div>
          </Field>

          {error && <div className="field-error" role="alert">{error}</div>}
          {success && <div style={{ fontSize: 12, color: C.forest, lineHeight: 1.55 }} role="status">{success}</div>}

          <button type="submit" className="btn btn-primary btn-block" disabled={loading} style={{ padding: "12px" }}>
            {loading ? (mode === "signin" ? t.signingIn : t.signingUp) : (mode === "signin" ? t.signIn : t.signUp)}
          </button>
        </form>

        <button
          type="button"
          className="btn btn-ghost btn-block btn-sm"
          style={{ marginTop: 8 }}
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setSuccess(""); }}
        >
          {mode === "signin" ? t.noAccount : t.hasAccount}
        </button>

        <p className="tiny" style={{ textAlign: "center", marginTop: 18, lineHeight: 1.6 }}>
          🔒 {t.privacyNote}
        </p>
      </div>
    </div>
  );
}
