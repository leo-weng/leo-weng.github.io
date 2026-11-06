// Screenshot the hitting window on a Shoot and the contact meter mid-sweep, plus the result's contact line.
const { chromium } = require(process.env.PW);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  await p.goto('file://' + process.cwd() + '/dist/smoke.html');
  await p.waitForSelector('button.call[data-call]');
  await p.click('button.call[data-call="Shoot"]');
  await p.click('#set-go');
  await p.waitForSelector('#swing');
  await p.waitForTimeout(3500);
  await p.click('#swing');
  await p.waitForTimeout(300);
  await p.screenshot({ path: 'dist/meter.png', fullPage: true });
  await p.click('#swing');
  await p.waitForSelector('.contact-line');
  console.log('contact:', await p.textContent('.contact-line'), '|', await p.textContent('.result-line'));
  await b.close();
})();
