// Turns GO-LIVE-GUIDE.md into public/guide.html so the guide can be opened on a
// phone from the same link as the app:
//
//   https://redzidvlp.github.io/Meal/guide.html
//
//   npm run build:guide
//
// Deliberately not part of `npm run build`: the page rarely changes and the extra
// 25 kB should not sit in the phone's precache.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const markdown = readFileSync(join(root, "GO-LIVE-GUIDE.md"), "utf8");

marked.setOptions({ gfm: true, breaks: false });
const body = marked.parse(markdown);

const css = `
:root{--ink:#1d2420;--muted:#5d6a63;--line:#e2e6e0;--bg:#f6f5f0;--card:#fffdf7;--accent:#2f6b4f;--accent-soft:#e8f0e6}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.62 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:0 0 64px}
main{max-width:760px;margin:0 auto;padding:18px 18px 0}
h1{font-size:1.7rem;line-height:1.2;margin:8px 0 4px;letter-spacing:-.02em}
h2{font-size:1.24rem;margin:44px 0 10px;padding-top:16px;border-top:1px solid var(--line);letter-spacing:-.01em}
h3{font-size:1.02rem;margin:26px 0 6px;color:var(--accent)}
p,li{max-width:66ch}
a{color:var(--accent);text-underline-offset:2px}
code{background:#eceee8;border-radius:5px;padding:.12em .38em;font-size:.9em;word-break:break-word}
pre{background:#20261f;color:#eef3ea;padding:14px 16px;border-radius:12px;overflow-x:auto;font-size:.85rem;line-height:1.5}
pre code{background:none;padding:0;color:inherit;font-size:1em}
blockquote{margin:16px 0;padding:12px 16px;border-left:4px solid var(--accent);background:var(--accent-soft);border-radius:0 10px 10px 0}
blockquote p{margin:4px 0}
table{width:100%;border-collapse:collapse;margin:18px 0;font-size:.9rem;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:block;overflow-x:auto}
thead th{background:#eef1ea;text-align:left;font-size:.82rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
th,td{padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:none}
hr{border:0;border-top:1px solid var(--line);margin:34px 0}
ol,ul{padding-left:22px}
li{margin:3px 0}
strong{font-weight:650}
.top{position:sticky;top:0;z-index:5;display:flex;gap:12px;align-items:center;justify-content:space-between;background:rgba(246,245,240,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:9px 18px;font-size:.8rem;color:var(--muted);letter-spacing:.03em;text-transform:uppercase}
.top a{text-decoration:none}
@media (max-width:520px){body{font-size:15.5px}main{padding:14px 14px 0}h1{font-size:1.45rem}h2{font-size:1.15rem}th,td{padding:8px 9px;font-size:.85rem}}
@media print{.top{display:none}body{background:#fff}}
`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Our Table — go-live guide</title>
<meta name="description" content="Step-by-step setup for the Our Table meal planner: upgrade the existing Supabase project, put the keys in GitHub, install on both phones.">
<style>${css}</style></head>
<body>
<div class="top"><span>Our Table · go-live guide</span><a href="../">Open the app ↗</a></div>
<main>${body}</main>
</body></html>`;

mkdirSync(join(root, "public"), { recursive: true });
writeFileSync(join(root, "public", "guide.html"), html);
console.log(`public/guide.html ${(Buffer.byteLength(html) / 1024).toFixed(1)} kB`);
