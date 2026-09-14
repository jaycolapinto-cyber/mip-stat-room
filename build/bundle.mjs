// Builds a single self-contained .html that runs from a double-click (file://).
// ES modules can't load over file://, so data + stats + app are inlined as one
// classic script.
import { readFileSync, writeFileSync } from 'node:fs';

const d = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const data  = d('../dist/data.js').replace(/^export\s+/gm, '');
const stats = d('../dist/stats.js').replace(/^export\s+/gm, '');
const app   = d('../dist/app.js').replace(/^import[^;]+;\s*$/gm, '');

let html = d('../dist/index.html');
html = html.replace('<script type="module" src="app.js"></script>',
  `<script>\n(function(){\n"use strict";\n${data}\n${stats}\n${app}\n})();\n</script>`);

// This file is opened directly, so it needs its own document skeleton.
html = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n`
     + html.replace(/^(<title>[\s\S]*?<\/style>)/, '$1\n</head>\n<body>')
     + `\n</body>\n</html>\n`;

writeFileSync(new URL('../standalone/MIP-Stat-Room.html', import.meta.url), html);
console.log('bundled', (html.length / 1024).toFixed(0) + 'KB');
