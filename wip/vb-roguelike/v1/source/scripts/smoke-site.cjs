const { chromium } = require(process.env.PW);
(async () => { const b = await chromium.launch(); const p = await b.newPage(); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
 await p.goto('http://127.0.0.1:8765/wip/vb-roguelike/'); await p.waitForSelector('button.call[data-call]');
 for (let i=0;i<10;i++){ await (await p.$$('button.call[data-call]'))[0].click(); await p.waitForSelector('button.shot[data-shot]'); await (await p.$$('button.shot[data-shot]'))[0].click(); await (await p.waitForSelector('#next, #again, #new-game')).click(); }
 console.log(await p.title(), await p.$eval('.scoreboard', e=>e.innerText.replace(/\s+/g,' ')), errs); await b.close(); })();
