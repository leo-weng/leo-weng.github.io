const { chromium } = require(process.env.PW);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.goto('file://' + process.cwd() + '/dist/smoke.html');
  await p.waitForSelector('button.call[data-call="1"]');
  await p.tap('button.call[data-call="1"]');
  await p.screenshot({ path: 'dist/p-set.png' });
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: 'dist/p-set-top.png' });
  await p.tap('#set-go');
  await p.waitForSelector('#swing');
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: 'dist/p-hit.png', fullPage: false });
  await p.evaluate(() => window.scrollTo(0, 500));
  await p.screenshot({ path: 'dist/p-hit2.png', fullPage: false });
  await b.close();
})();
