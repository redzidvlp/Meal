// Renders the connection diagnostics for every error kind. Catches missing
// translations or a screen that crashes exactly when the kitchen is down.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ConnectionScreen, { SchemaNotice } from "../src/components/ConnectionScreen.jsx";
import { T } from "../src/data/translations.js";

const kinds = [
  { kind: "auth" },
  { kind: "config" },
  { kind: "missing_schema", table: "recipes" },
  { kind: "permission", table: "pantry" },
  { kind: "network", table: "households" },
  { kind: "paused" },
  { kind: "unknown", table: "menus", technical: '42P01 · relation "menus" does not exist' },
];

let failures = 0;
for (const lang of ["en", "lt"]) {
  for (const error of kinds) {
    const html = renderToStaticMarkup(
      React.createElement(ConnectionScreen, {
        t: T[lang],
        lang,
        error,
        host: "demo.supabase.co",
        onRetry: () => {},
        onSignOut: () => {},
      }),
    );
    const visible = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!visible || /undefined/.test(visible)) {
      failures += 1;
      console.log(`FAIL ${lang} ${error.kind}: ${visible.slice(0, 120)}`);
    }
  }
  const notice = renderToStaticMarkup(
    React.createElement(SchemaNotice, { t: T[lang], issues: [{ kind: "missing_schema", table: "labels" }] }),
  );
  if (!notice.includes("labels")) {
    failures += 1;
    console.log(`FAIL ${lang} schema notice did not name the table`);
  }
}

if (failures) {
  console.log(`CONNECTION SMOKE FAILED (${failures})`);
  process.exit(1);
}
console.log("CONNECTION SMOKE OK");
