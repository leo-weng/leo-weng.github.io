// Plays one full match in a headless browser by clicking the real buttons; saves a few screenshots.
const { chromium } = require(process.env.PW || "playwright");
(async () => {
  const out = process.argv[2] || "shots";
  require("fs").mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 400, height: 860 }, colorScheme: process.argv[3] || "light" });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("file://" + process.cwd() + "/dist/standalone.html");
  await p.screenshot({ path: `${out}/0-start.png`, fullPage: true });
  await p.click('[data-act="start"]');
  const seen = new Set();
  for (let step = 0; step < 600; step++) {
    if (await p.$('[data-act="again"]')) break;
    const role = (await p.textContent("#role")) || "";
    const key = role.includes("Server") ? "serve" : role.includes("Setter") ? "set" : role.includes("Hitter") ? "hit" : role.includes("Puppet") ? "defend" : (await p.$('[data-act="upgrade"]')) ? "upgrade" : "result";
    if (key === "defend" && !seen.has("defend-move") && seen.has("defend")) {
      // Show a move in progress once: select a defender and screenshot the target squares.
      const d = await p.$$("[data-def]"); if (d.length) { await d[0].click(); seen.add("defend-move"); await p.screenshot({ path: `${out}/defend-move.png`, fullPage: true }); const sq = await p.$$("[data-sq]"); if (sq.length) await sq[0].click(); }
    }
    if (!seen.has(key)) { seen.add(key); await p.waitForTimeout(1700); await p.screenshot({ path: `${out}/${seen.size}-${key}.png`, fullPage: true }); }
    if (key === "serve") { const ps = await p.$$("[data-serve]"); await ps[step % ps.length].click(); await p.click('[data-act="serve"]'); }
    else if (key === "set") { await p.click('[data-act="set"]'); }
    else if (key === "hit") { for (let k = 0; k < 9; k++) { const t = await p.$$("[data-tile]"); if (!t.length) break; await t[(step * 7 + k) % t.length].click(); if (await p.$('[data-act="swing"]:not([disabled])')) break; await p.click('[data-act="shot"][data-v="Roll"]'); if (await p.$('[data-act="swing"]:not([disabled])')) break; } if (!(await p.$('[data-act="swing"]:not([disabled])'))) { await p.click('[data-act="shot"][data-v="Tip"]'); const t = await p.$$("[data-tile]"); await t[step % 12].click(); } await p.click('[data-act="swing"]'); }
    else if (key === "defend") { if (step % 2) { const d = await p.$$("[data-def]"); if (d.length) { await d[step % d.length].click(); const sq = await p.$$("[data-sq]"); if (sq.length) await sq[step % sq.length].click(); } } await p.click('[data-act="ready"]'); }
    else if (key === "upgrade") { await p.click('[data-act="upgrade"]'); }
    else { await p.click('[data-act="next"]'); }
  }
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/9-end.png`, fullPage: true });
  console.log("end:", (await p.textContent("#role")).trim().slice(0, 120), "| errors:", errors.length ? errors : "none", "| screens:", [...seen].join(","));
  await b.close();
})();
