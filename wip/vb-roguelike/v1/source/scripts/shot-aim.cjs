// Screenshots for free aim: drag on the court, the easy setter screen, and "they're onto you".
const { chromium } = require(process.env.PW);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.goto('file://' + process.cwd() + '/dist/smoke.html');
  await p.waitForSelector('button.call[data-call]');
  await p.click('#set-go');
  await p.waitForSelector('#swing');
  const box = await (await p.$('.court-wrap svg')).boundingBox();
  // Court x 0–9, y 0–9 maps to svg (x+1.2)*40, (9.8-y)*40 in a 456x464 viewBox.
  const at = (x, y) => ({ x: box.x + ((x + 1.2) * 40) * box.width / 456, y: box.y + ((9.8 - y) * 40) * box.height / 464 });
  const a = at(4, 6), c = at(7.5, 7.5);
  await p.mouse.move(a.x, a.y); await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(a.x + (c.x - a.x) * i / 8, a.y + (c.y - a.y) * i / 8);
  await p.mouse.up();
  console.log('swing label:', await p.textContent('#swing'));
  await p.screenshot({ path: 'dist/aim.png', fullPage: true });
  await p.click('#swing'); await p.waitForTimeout(400); await p.click('#swing');
  await p.waitForSelector('#next, #again, #new-game');
  console.log('result:', await p.textContent('.result-line'));
  await p.screenshot({ path: 'dist/aim-result.png', fullPage: true });
  await p.click('#next, #again, #new-game');
  // Easy mode setter screen with a renamed call.
  await p.selectOption('#mode', 'Easy');
  await p.click('#names summary');
  await p.fill('input[data-name="1"]', 'yaya');
  await p.press('input[data-name="1"]', 'Tab');
  await p.waitForTimeout(100);
  console.log('easy calls:', (await p.$$eval('button.call', (bs) => bs.map((x) => x.querySelector('.call-name').textContent))).join(' | '));
  await p.screenshot({ path: 'dist/easy.png', fullPage: true });
  // Feed the outside six times so they key on it.
  await p.selectOption('#mode', 'Normal');
  for (let i = 0; i < 6; i++) {
    await p.waitForSelector('#set-go');
    await p.click('#set-go');
    await p.waitForSelector('#swing');
    if (i === 5) break;
    await p.click('#swing'); await p.waitForTimeout(400); await p.click('#swing');
    await p.waitForSelector('#next, #again, #new-game');
    await p.click('#next, #again, #new-game');
  }
  console.log('onto:', await p.$eval('.onto', (e) => e.textContent).catch(() => 'none'));
  await p.screenshot({ path: 'dist/onto.png', fullPage: false });
  const ph = await b.newPage({ viewport: { width: 390, height: 844 } });
  await ph.goto('file://' + process.cwd() + '/dist/smoke.html');
  await ph.click('#set-go');
  await ph.waitForSelector('#swing');
  await ph.screenshot({ path: 'dist/aim-phone.png', fullPage: true });
  console.log('phone scrollWidth', await ph.evaluate(() => document.documentElement.scrollWidth));
  console.log('errors', errors);
  await b.close();
})();
