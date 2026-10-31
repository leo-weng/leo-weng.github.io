// Run flow: win each game via the test hook, take rewards, check the boss and the end screen.
const { chromium } = require(process.env.PW);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto('file://' + process.cwd() + '/dist/smoke.html#test');
  await p.waitForSelector('button.call[data-call]');
  await p.screenshot({ path: 'dist/run-set.png' });
  for (let i = 0; i < 4; i++) {
    console.log('match', i + 1, await p.$eval('.score-mid', (e) => e.innerText.replace(/\s+/g, ' ')));
    await p.evaluate(() => window.__vb.winGame());
    if (await p.$('[data-reward]')) {
      if (i === 0) await p.screenshot({ path: 'dist/run-reward.png' });
      console.log('  offer:', (await p.$$eval('.reward-title', (r) => r.map((x) => x.textContent))).join(' | '));
      await p.click('[data-reward="0"]');
      await p.waitForSelector('button.call[data-call]');
    }
  }
  console.log('end:', await p.$eval('.callout', (e) => e.textContent));
  console.log('route panel:', await p.$eval('.route', (e) => e.innerText.replace(/\s+/g, ' ')));
  console.log('errors', errors);
  await b.close();
})();
