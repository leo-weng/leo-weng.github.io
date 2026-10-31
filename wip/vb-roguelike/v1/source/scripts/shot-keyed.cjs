const { chromium } = require(process.env.PW);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.goto('file://' + process.cwd() + '/dist/smoke.html');
  for (let i = 0; i < 7; i++) {
    await p.waitForSelector('button.call[data-call]');
    await p.click('#set-go');
    await p.waitForSelector('#swing');
    if (i === 6) break;
    await p.click('#swing'); await p.waitForTimeout(400); await p.click('#swing');
    await p.waitForSelector('#next, #again, #new-game');
    await p.click('#next, #again, #new-game');
  }
  await p.screenshot({ path: 'dist/keyed.png', fullPage: true });
  await b.close();
})();
