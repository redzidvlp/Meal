import { useEffect, useRef, useState } from "react";
import { C } from "../theme.js";
import { fmtNum, interpolate } from "../lib/format.js";

const MAX = 2200;
const GOAL = 1800;

export default function WaterCard({ t, myName, otherName, myWater, otherWater, onChange }) {
  const [local, setLocal] = useState(myWater || 0);
  const timer = useRef(null);

  useEffect(() => { setLocal(myWater || 0); }, [myWater]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const push = value => {
    const next = Math.max(0, Math.min(MAX, Math.round(value)));
    setLocal(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(next), 400);
  };

  const rows = [
    { key: "R", name: myName, value: local, editable: true, color: C.R },
    { key: "I", name: otherName, value: otherWater || 0, editable: false, color: C.I },
  ];

  return (
    <div className="card card-pad" style={{ marginBottom: 14, background: "linear-gradient(160deg,#f7fbfd,#fdfcf7)", borderColor: "#d9e7ef" }}>
      <div className="row-between" style={{ marginBottom: 10 }}>
        <div style={{ fontFamily: "var(--display)", fontSize: 14.5, color: C.sky }}>💧 {t.water}</div>
        <div className="tiny">{t.waterGoal}</div>
      </div>

      {rows.map(row => {
        const reached = row.value >= GOAL;
        const color = reached ? C.leaf : row.color;
        return (
          <div key={row.key} style={{ marginBottom: row.editable ? 12 : 0 }}>
            <div className="row-between" style={{ marginBottom: 5 }}>
              <span className="row" style={{ gap: 5 }}>
                <span className="person-dot" style={{ background: row.color }} />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: row.color }}>{row.name}</span>
                {!row.editable && <span className="tiny">({t.viewOnly})</span>}
                {reached && <span aria-hidden="true">🎉</span>}
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color }}>{fmtNum(row.value)} ml</span>
            </div>
            <div className="progress" style={{ height: 7, marginBottom: row.editable ? 8 : 0, position: "relative" }}>
              <div style={{ width: `${Math.min(row.value / MAX, 1) * 100}%`, background: color }} />
              <span style={{ position: "absolute", left: `${(GOAL / MAX) * 100}%`, top: -1, bottom: -1, width: 1.5, background: reached ? "#fff" : "#8fa3ac" }} />
            </div>
            {row.editable && (
              <>
                <input
                  type="range"
                  min={0}
                  max={MAX}
                  step={100}
                  value={local}
                  onChange={event => push(Number(event.target.value))}
                  style={{ width: "100%", marginBottom: 8 }}
                  aria-label={t.water}
                />
                <div className="row" style={{ gap: 6 }}>
                  {[250, 500].map(amount => (
                    <button key={amount} type="button" className="btn btn-sm btn-soft" style={{ flex: 1, color: C.sky }} onClick={() => push(local + amount)}>
                      {interpolate(t.waterAdd, { n: amount })} 🚰
                    </button>
                  ))}
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => push(0)} title={t.waterReset} aria-label={t.waterReset}>↺</button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
