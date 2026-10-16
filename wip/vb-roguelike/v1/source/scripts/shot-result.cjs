const { chromium } = require(process.env.PW);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 1400 } });
  await p.goto('file://' + process.cwd() + '/dist/smoke.html');
  const seen = {};
  for (let i = 0; i < 80 && Object.keys(seen).length < 5; i++) {
    await p.waitForSelector('#set-go'); await p.click('#set-go');
    await p.waitForSelector('#swing'); await p.click('#swing'); await p.waitForTimeout(400); await p.click('#swing');
    await p.waitForSelector('.result');
    const line = await p.$eval('.result-line b', e => e.textContent);
    const touch = await p.$$eval('.why li', l => l.some(x => /touch/.test(x.textContent)));
    const key = line + (touch ? '+touch' : '');
    if (!seen[key]) {
      seen[key] = 1;
      await p.waitForTimeout(650);
      const el = await p.$('.result .netview');
      await el.screenshot({ path: `dist/r-${key}-mid.png` });
      await p.waitForTimeout(1200);
      const sec = await p.$('.result'); await sec.screenshot({ path: `dist/r-${key}-end.png` });
    }
    await p.click('#next, #again, #new-game');
  }
  console.log(Object.keys(seen));
  await b.close();
})();
