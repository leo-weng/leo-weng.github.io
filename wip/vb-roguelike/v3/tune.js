const { setup, zones, verdict } = require("./model.js");
let a = 7; const rng = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
const hist = [0,0,0,0,0,0,0]; let n = 5000;
for (let i = 0; i < n; i++) { const s = setup(rng); hist[zones().filter(z => verdict(s, z) === "kill").length]++; }
console.log(hist.map(x => (x / n * 100).toFixed(0) + "%").join(" "));
