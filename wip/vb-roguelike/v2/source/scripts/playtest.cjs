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
    if (!seen.has(key)) { seen.add(key); await p.waitForTimeout(1700); await p.screenshot({ path: `${out}/${seen.size}-${key}.png`, fullPage: true }); }
    if (key === "serve") { const ps = await p.$$("[data-passer]"); await ps[step % 3].click(); await p.click('[data-act="serve"]'); }
    else if (key === "set") { await p.click('[data-act="set"]'); }
    else if (key === "hit") { const t = await p.$$("[data-tile]"); await t[(step * 7) % t.length].click(); await p.click('[data-act="swing"]'); }
    else if (key === "defend") { if (step % 2) { const t = await p.$$("[data-tile]"); await t[step % t.length].click(); } await p.click('[data-act="ready"]'); }
    else if (key === "upgrade") { await p.click('[data-act="upgrade"]'); }
    else { await p.click('[data-act="next"]'); }
  }
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/9-end.png`, fullPage: true });
  console.log("end:", (await p.textContent("#role")).trim().slice(0, 120), "| errors:", errors.length ? errors : "none", "| screens:", [...seen].join(","));
  await b.close();
})();
