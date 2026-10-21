import { useEffect, useState } from "react";
import { C, HOUSEHOLD_SIZE } from "../theme.js";
import { Chip, ConfirmDialog, Segmented, Sheet, Stepper, useCopy } from "./ui.jsx";
import { setOverrideDemo } from "../lib/errors.js";
import { currentBuildId } from "../lib/build.js";

export default function SettingsSheet({ open, onClose, app, lang, setLang, t, pwa }) {
  const [name, setName] = useState(app.household?.name || "");
  const [resetOpen, setResetOpen] = useState(false);
  const [updateNote, setUpdateNote] = useState("");
  const { copied, copy } = useCopy();

  const checkUpdates = async () => {
    if (!pwa?.supported) {
      setUpdateNote(t.updateUnsupported);
      return;
    }
    setUpdateNote(t.updateChecking);
    const started = await pwa.checkNow();
    if (!started) {
      setUpdateNote(t.updateCheckFailed);
      return;
    }
    // The service worker needs a moment to register a waiting build.
    window.setTimeout(() => setUpdateNote(t.updateUpToDate), 1400);
  };

  useEffect(() => {
    if (open) setName(app.household?.name || "");
  }, [open, app.household?.name]);

  const members = app.profiles.length
    ? app.profiles
    : [{ personKey: app.profile?.personKey || "R", displayName: app.profile?.displayName || "", id: app.profile?.id }];

  return (
    <>
      <Sheet open={open} onClose={onClose} title={t.settingsTitle} subtitle={app.household?.name}>
        <section>
          <div className="eyebrow" style={{ marginBottom: 8 }}>{t.household}</div>
          <div className="row" style={{ gap: 8 }}>
            <input
              className="input input-sm"
              value={name}
              maxLength={80}
              onChange={event => setName(event.target.value)}
              aria-label={t.householdName}
              placeholder={t.householdNamePlaceholder}
            />
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => app.updateHousehold({ name: name.trim() || "Our kitchen" }).catch(() => {})}
              disabled={!name.trim() || name.trim() === app.household?.name}
            >
              {t.save}
            </button>
          </div>

          <div className="settings-row">
            <div style={{ flex: 1 }}>
              <div className="settings-label">{t.inviteCodeLabel}</div>
              <div className="settings-hint">{t.inviteCodeHint}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="invite-code">{app.household?.inviteCode || "······"}</div>
              <button
                type="button"
                className="btn btn-xs btn-soft"
                style={{ marginTop: 6 }}
                onClick={() => copy(app.household?.inviteCode || "")}
                disabled={!app.household?.inviteCode}
              >
                {copied ? `✓ ${t.copied}` : t.copyCode}
              </button>
            </div>
          </div>

          <div className="settings-row" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div className="settings-label">{t.members}</div>
              <div className="settings-hint">{t.householdName}</div>
            </div>
            <div className="stack" style={{ gap: 5, alignItems: "flex-end" }}>
              {members.map(member => (
                <span key={member.id || member.personKey} className="row" style={{ gap: 5 }}>
                  <span className="person-dot" style={{ background: member.personKey === "R" ? C.R : C.I }} />
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{member.displayName || t.personFallback[member.personKey]}</span>
                  {member.personKey === app.profile?.personKey && <Chip as="span" tone="sage">{t.you}</Chip>}
                </span>
              ))}
            </div>
          </div>
        </section>

        <div className="divider" />

        <section>
          <div className="eyebrow" style={{ marginBottom: 8 }}>{t.language}</div>
          <Segmented
            value={lang}
            onChange={setLang}
            options={[{ value: "en", label: "English" }, { value: "lt", label: "Lietuvių" }]}
          />

          <div className="settings-row" style={{ marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <div className="settings-label">{t.extraPortionsSetting}</div>
              <div className="settings-hint">{t.extraPortionsHint}</div>
            </div>
            <Stepper
              value={HOUSEHOLD_SIZE + app.extraPortions}
              min={HOUSEHOLD_SIZE}
              max={HOUSEHOLD_SIZE + 8}
              label={t.extraPortionsSetting}
              onChange={total => app.updateHousehold({ extraPortions: total - HOUSEHOLD_SIZE }).catch(() => {})}
            />
          </div>
        </section>

        <div className="divider" />

        <section>
          <div className="eyebrow" style={{ marginBottom: 8 }}>{t.security}</div>
          <div className="settings-row" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 6 }}>
                <span style={{ fontSize: 14 }} aria-hidden="true">{app.isDemo ? "🧪" : "☁️"}</span>
                <span className="settings-label">{app.isDemo ? t.demoMode : t.cloudConnected}</span>
              </div>
              <div className="settings-hint" style={{ marginTop: 4 }}>
                {app.isDemo ? t.demoBody : t.securityBody}
              </div>
            </div>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">{t.signedInAs}</div>
              <div className="settings-hint">{app.session?.user?.email || "—"}</div>
            </div>
            {!app.isDemo && (
              <button type="button" className="btn btn-sm btn-soft" onClick={() => { onClose(); app.signOut().catch(() => {}); }}>
                {t.signOut}
              </button>
            )}
            {app.isDemo && app.isCloudConfigured && (
              <button
                type="button"
                className="btn btn-sm btn-soft"
                onClick={() => { setOverrideDemo(false); window.location.reload(); }}
              >
                {t.tryCloud}
              </button>
            )}
          </div>
        </section>

        <div className="divider" />

        <section>
          <div className="eyebrow" style={{ marginBottom: 6, color: C.danger }}>{t.dangerZone}</div>
          <button type="button" className="btn btn-danger btn-block" style={{ marginTop: 6 }} onClick={() => setResetOpen(true)}>
            🗓️ {t.resetWeekSetting}
          </button>
          <p className="tiny" style={{ marginTop: 6 }}>{t.resetWeekHint}</p>
        </section>

        <div className="divider" />

        <section>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{t.updateSection}</div>
          <div className="settings-row">
            <div style={{ flex: 1 }}>
              <div className="settings-label">{t.updateCheckNow}</div>
              <div className="settings-hint">{updateNote || (pwa?.needRefresh ? t.updateAvailableNow : t.versionHint)}</div>
            </div>
            <button type="button" className="btn btn-sm btn-soft" onClick={checkUpdates} disabled={pwa?.checking || pwa?.needRefresh}>
              {pwa?.checking ? t.updateChecking : t.updateCheckNow}
            </button>
          </div>
        </section>

        <div className="divider" />
        <div className="row-between">
          <span className="tiny">
            {t.version} 2.0.0
            {currentBuildId() ? ` · ${currentBuildId()}` : ""}
          </span>
          <span className="tiny">{t.madeWith}</span>
        </div>
      </Sheet>

      <ConfirmDialog
        open={resetOpen}
        title={t.resetConfirmTitle}
        body={t.resetConfirmBody}
        confirmLabel={t.resetYes}
        cancelLabel={t.resetNo}
        onClose={() => setResetOpen(false)}
        onConfirm={async () => {
          setResetOpen(false);
          onClose();
          try {
            await app.resetWeek();
          } catch {
            // handled by the hook
          }
        }}
      />
    </>
  );
}
