import { useState } from "react";
import { describeLoadError, schemaState, setOverrideDemo, CORE_TABLES } from "../lib/errors.js";
import { interpolate } from "../lib/format.js";

const SCHEMA_VERSION = "v4";

function kindCopy(t, kind, host) {
  const where = { host: host || "—" };
  switch (kind) {
    case "auth":
      return { icon: "🔑", title: t.connectionAuthTitle, body: t.connectionAuthBody };
    case "config":
      return { icon: "🔐", title: t.connectionConfigTitle, body: interpolate(t.connectionConfigBody, { host: host || "—" }) };
    case "missing_schema":
      return { icon: "🧱", title: t.connectionMissingSchemaTitle, body: interpolate(t.connectionMissingSchemaBody, { version: SCHEMA_VERSION }) };
    case "not_found":
      return { icon: "🏚️", title: t.connectionNoKitchenTitle, body: t.connectionNoKitchenBody };
    case "permission":
      return { icon: "🚪", title: t.connectionPermissionTitle, body: t.connectionPermissionBody };
    case "network":
      return { icon: "📡", title: t.connectionNetworkTitle, body: interpolate(t.connectionNetworkBody, where) };
    case "paused":
      return { icon: "⏸️", title: t.connectionPausedTitle, body: interpolate(t.connectionPausedBody, where) };
    default:
      return { icon: "🛠️", title: t.connectionUnknownTitle, body: t.connectionUnknownBody };
  }
}

function technicalLines(error) {
  const info = error?.kind ? error : describeLoadError(error);
  return [
    info.kind && `${info.kind}`,
    info.table && `${t_line("table", info.table)}`,
    info.status && `HTTP ${info.status}`,
    info.technical,
  ].filter(Boolean);
}

const t_line = (label, value) => `${label}: ${value}`;

/**
 * Full-screen diagnostic shown when the kitchen itself cannot be read.
 * It names the failing table and the likely fix instead of "try again".
 */
export default function ConnectionScreen({ t, error, host, onRetry, onSignOut, lang }) {
  const [open, setOpen] = useState(false);
  const info = error?.kind ? error : describeLoadError(error);
  const copy = kindCopy(t, info.kind, host);
  const lines = technicalLines(error);

  const missing = info.kind === "missing_schema"
    ? (Array.isArray(error?.missing) && error.missing.length
      ? error.missing
      : [info.table || "schema.sql"])
    : [];

  return (
    <div className="auth-screen connection-screen">
      <div className="auth-card">
        <div className="connection-icon" aria-hidden="true">{copy.icon}</div>
        <h1 className="connection-title">{copy.title}</h1>
        <p className="connection-body">{copy.body}</p>
        {missing.length > 0 && (
          <ul className="connection-list">
            {missing.map(table => <li key={table}>{interpolate(t.connectionMissingTable, { table })}</li>)}
          </ul>
        )}
        <details className="connection-details" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
          <summary>{t.connectionTechnical}</summary>
          <pre>{lines.join("\n")}</pre>
        </details>

        <div className="connection-actions">
          <button type="button" className="btn btn-primary" onClick={onRetry}>{t.connectionRetry}</button>
          {onSignOut && (
            <button type="button" className="btn btn-soft" onClick={onSignOut}>{t.connectionSignOut}</button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setOverrideDemo(true);
              window.location.reload();
            }}
          >
            {t.connectionDemo}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Slim banner for a project that opened fine but is missing the newer tables.
 * The kitchen stays usable; this just explains why labels/hidden sections do not sync.
 */
export function SchemaNotice({ t, issues }) {
  const [hidden, setHidden] = useState(false);
  const state = schemaState(issues || []);
  if (state.level === 2 || hidden) return null;
  const names = state.missing.join(", ");
  return (
    <div className="schema-notice" role="status">
      <span aria-hidden="true">🧱</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>{t.schemaOutdatedTitle}</b>
        <div className="tiny">{interpolate(t.schemaOutdatedBody, { tables: names })}</div>
      </div>
      <button type="button" className="btn btn-xs btn-ghost" onClick={() => setHidden(true)}>{t.schemaOutdatedDismiss}</button>
    </div>
  );
}

export { CORE_TABLES };
