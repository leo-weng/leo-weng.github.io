const { chromium } = require(process.env.PW);
const fs = require('fs');
(async () => {
  const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + fs.readFileSync('dist/index.html','utf8') + '</body></html>';
  fs.writeFileSync('dist/smoke.html', html);
  const b = await chromium.launch();
  const errors = [];
  for (const [w,h,name] of [[1200,900,'desk'],[400,850,'phone']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type()==='error' && errors.push(m.text()));
    await p.goto('file://' + process.cwd() + '/dist/smoke.html');
    await p.waitForSelector('#serve-go, button.call[data-call], #next');
    // Play by whatever screen is up: serve, set, hit, or a result.
    let serves = 0;
    for (let i = 0; i < 160; i++) {
      if (await p.$('[data-reward]')) { await p.click('[data-reward]'); global.rewards = (global.rewards||0)+1; continue; }
      if (await p.$('.phase #start-run')) { await p.click('.phase #start-run'); global.runEnds = (global.runEnds||0)+1; continue; }
      if (await p.$('#serve-go')) { const ts = await p.$$('[data-serve-type]'); await ts[i % 3].click(); const at = await p.$$('[data-serve-at]'); await at[i % at.length].click(); if (name==='desk' && !serves) await p.screenshot({ path: 'dist/serve.png', fullPage: true }); serves++; await p.click('#serve-go'); await p.waitForTimeout(150); continue; }
      if (await p.$('button.call[data-call]')) { const calls = await p.$$('button.call[data-call]'); await calls[i % calls.length].click(); if (await p.$('#set-go')) await p.click('#set-go'); await p.waitForSelector('button.shot[data-kind]'); continue; }
      if (await p.$('button.shot[data-kind]')) { const shots = await p.$$('button.shot[data-kind]'); await shots[(i*3) % shots.length].click(); if (i % 5 === 0 && await p.$('#big')) { await p.click('#big'); await p.click('#swing'); await p.waitForTimeout(400); await p.click('#swing'); } else if (await p.$('#swing')) await p.click('#swing'); await p.waitForSelector('#next, #again, #new-game, #after-game'); continue; }
      const nb = await p.$('#next, #again, #new-game, #after-game'); if (nb) { await nb.click(); await p.waitForTimeout(100); continue; }
      await p.waitForTimeout(300);
    }
    console.log(name, 'serves', serves);
    console.log(name, 'score', await p.$eval('.scoreboard', e => e.innerText.replace(/\s+/g,' ')));
    if (name==='desk') { await p.evaluate(() => { document.querySelector('#numbers').open = true; }); const inp = await p.$('input[data-t="base.Hard"]'); await inp.fill('0.7'); await inp.dispatchEvent('change'); console.log('base.Hard now', await p.$eval('input[data-t="base.Hard"]', e => e.value)); }

    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    console.log(name, 'scrollWidth', sw, 'rallies', await p.$$eval('.log li', l => l.length));
    if (name==='phone') await p.screenshot({ path: 'dist/phone.png', fullPage: true });
  }
  console.log('rewards taken', global.rewards||0, 'run ends', global.runEnds||0);
  console.log('errors', errors);
  await b.close();
})();
