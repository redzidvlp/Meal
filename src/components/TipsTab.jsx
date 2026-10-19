import { useState } from "react";
import { C } from "../theme.js";
import { TIPS } from "../data/presets.js";

export default function TipsTab({ lang, t }) {
  const [open, setOpen] = useState(null);

  return (
    <div className="fade-in">
      <div className="eyebrow">💡 {t.navTips}</div>
      <h1 className="page-title">{t.tipsTitle}</h1>
      <p className="page-sub">{t.tipsSub}</p>

      <div className="card card-pad" style={{ marginBottom: 10, background: "linear-gradient(150deg,#eef4e8,#faf4e7)", borderColor: "#dbe6d1" }}>
        <div style={{ fontFamily: "var(--display)", fontSize: 16, color: C.forest, marginBottom: 6 }}>🌿 {t.fodmapTitle}</div>
        <p style={{ fontSize: 12.5, lineHeight: 1.75, margin: 0, color: C.inkSoft }}>{t.fodmapBody}</p>
        <p style={{ fontSize: 12.5, lineHeight: 1.75, margin: "9px 0 0", color: C.inkSoft }}>{t.fodmapPhases}</p>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16, borderColor: "#dbe6d1" }}>
        <div style={{ fontFamily: "var(--display)", fontSize: 15, color: C.forest, marginBottom: 4 }}>🥬 {t.vegNoteTitle}</div>
        <p style={{ fontSize: 12.5, lineHeight: 1.7, margin: 0, color: C.inkSoft }}>{t.vegNoteBody}</p>
      </div>

      <div className="stack" style={{ gap: 7 }}>
        {(TIPS[lang] || TIPS.en).map((tip, index) => {
          const isOpen = open === index;
          return (
            <div key={tip.title} className="card tip-card">
              <div
                className="tip-head"
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : index)}
                onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpen(isOpen ? null : index); } }}
              >
                <span style={{ fontSize: 18 }} aria-hidden="true">{tip.icon}</span>
                <span className="tip-title">{tip.title}</span>
                <span className={`chevron ${isOpen ? "open" : ""}`} aria-hidden="true">▼</span>
              </div>
              {isOpen && <div className="tip-body">{tip.body}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
