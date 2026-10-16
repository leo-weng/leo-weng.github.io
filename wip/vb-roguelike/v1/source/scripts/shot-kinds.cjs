// Screenshot the court for each attack type on one ball.
const { chromium } = require(process.env.PW);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.goto('file://' + process.cwd() + '/dist/smoke.html');
  await p.waitForSelector('button.call[data-call]');
  await p.click('#set-go');
  await p.waitForSelector('#swing');
  for (const k of ['Hard', 'Tip', 'Roll']) {
    await p.click(`button[data-kind="${k}"]`);
    await (await p.$('.hit-grid')).screenshot({ path: `dist/kind-${k}.png` });
  }
  await b.close();
})();
