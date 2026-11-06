// Bundles src/ui.ts and inlines it into src/template.html -> dist/index.html (one self-contained page).
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const out = await build({ entryPoints: ["src/ui.ts"], bundle: true, format: "iife", target: "es2020", minify: true, write: false });
const js = out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = readFileSync("src/template.html", "utf8").replace("/*BUNDLE*/", () => js);
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", html);
// Standalone copy for static hosting (the Artifact viewer adds this skeleton itself).
const title = html.match(/<title>.*?<\/title>/)?.[0] ?? "";
const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${title}
<style>body{margin:0}[hidden]{display:none!important}</style>
</head>
<body>
${html.replace(title, "")}
</body>
</html>
`;
writeFileSync("dist/standalone.html", standalone);
console.log(`dist/index.html ${(html.length / 1024).toFixed(1)} KB, dist/standalone.html`);
