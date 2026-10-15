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
if (!/<input id="hours"[^>]*step="0\.01"/.test(html)) {
  throw new Error('Main Hours input must accept hundredths.');
}
const calendarPosition = html.indexOf('id="calendar-page"');
const historyPosition = html.indexOf('id="history"');
const paystubPosition = html.indexOf('id="paystub-import"');
if (!(calendarPosition < historyPosition && historyPosition < paystubPosition)) {
  throw new Error('Shift History must follow the calendar and precede paystub import.');
}
if (!/HISTORY_PAGE_SIZE\s*=\s*10/.test(scripts)) {
  throw new Error('Shift History must be limited to 10 entries per page.');
}
if (!/<th><abbr title="Shift date">Shift<\/abbr><\/th><th>Pay date<\/th>/.test(html)) {
  throw new Error('Shift History must show Shift before Pay date.');
}
console.log(`DOM contract passed: ${used.size} referenced ids found`);
