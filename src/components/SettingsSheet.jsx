import { useEffect, useState } from "react";
import { C } from "../theme.js";
import { Chip, ConfirmDialog, Segmented, Sheet, Stepper, useCopy } from "./ui.jsx";

export default function SettingsSheet({ open, onClose, app, lang, setLang, t }) {
  const [name, setName] = useState(app.household?.name || "");
  const [resetOpen, setResetOpen] = useState(false);
  const { copied, copy } = useCopy();

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
              value={app.extraPortions}
              min={0}
              max={8}
              label={t.extraPortionsSetting}
              onChange={value => app.updateHousehold({ extraPortions: value }).catch(() => {})}
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
        <div className="row-between">
          <span className="tiny">{t.version} 2.0.0</span>
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
