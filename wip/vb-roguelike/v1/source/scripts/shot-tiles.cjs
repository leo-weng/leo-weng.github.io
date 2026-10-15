// Screenshot the tile court, normal and Hard mode.
const { chromium } = require(process.env.PW);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.goto('file://' + process.cwd() + '/dist/smoke.html');
  await p.waitForSelector('button.call[data-call]');
  await p.click('#set-go');
  await p.waitForSelector('#swing');
  await (await p.$('.court-wrap')).screenshot({ path: 'dist/tiles.png' });
  await p.click('#hard');
  await (await p.$('.court-wrap')).screenshot({ path: 'dist/tiles-hard.png' });
  await p.click('#swing');
  await p.waitForSelector('#next, #again, #new-game');
  console.log(await p.textContent('.result-line'));
  await b.close();
})();
