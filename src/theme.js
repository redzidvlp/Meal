export const FONT = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,500;0,700;1,400&family=DM+Sans:wght@300;400;500;600&family=Caveat:wght@500;700&display=swap');`;

export const P = {
    bg: "#F3EDE3", card: "#FDFAF3", border: "#E0D6C0",
    accent: "#7A6E5F", green: "#4F7A52", amber: "#B07A3A",
    text: "#261E13", muted: "#6A5D4A", light: "#EBE4D4",
    R: "#A85848", I: "#4878A8", water: "#4A7FA8",
};

export const S = {
    card: { background: P.card, border: `1.5px solid ${P.border}`, borderRadius: 14 },
    btn: (bg, color, border) => ({ background: bg, color, border: `1.5px solid ${border || bg}`, borderRadius: 10, padding: "6px 14px", cursor: "pointer", fontFamily: "'DM Sans'", fontWeight: 700, fontSize: 12 }),
    label: { fontFamily: "'DM Sans'", fontSize: 10, fontWeight: 700, color: P.muted, textTransform: "uppercase", letterSpacing: .8 },
    serif: (size, weight = 700) => ({ fontFamily: "'DM Sans', sans-serif", fontSize: size, fontWeight: weight, color: P.text }),
    sans: (size, color = P.text) => ({ fontFamily: "'DM Sans'", fontSize: size, color }),
};