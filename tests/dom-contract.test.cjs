const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = ['app.js', 'paystub.mjs', 'cloud.js']
  .map(file => fs.readFileSync(path.join(root, file), 'utf8'))
  .join('\n');
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
const used = new Set([...scripts.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map(match => match[1]));
const missing = [...used].filter(id => !ids.has(id));

if (missing.length) throw new Error(`Missing DOM ids: ${missing.join(', ')}`);
console.log(`DOM contract passed: ${used.size} referenced ids found`);
