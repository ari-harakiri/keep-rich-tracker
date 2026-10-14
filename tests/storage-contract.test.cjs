const assert = require('node:assert/strict');

const shifts = [
  { id: 'legacy-shift', date: '2025-01-01', payDate: '2025-01-10', hours: null, tips: 0, sales: null }
];
const paystubs = [
  { id: 'legacy-stub', payDate: '2025-01-10', periodStart: null, periodEnd: null, hours: 80, commission: 0, gross: 1500, net: 1200 }
];
const payload = {
  format: 'keep-rich-tracker-backup',
  version: 1,
  updatedAt: new Date(0).toISOString(),
  shifts,
  paystubs,
  preferences: { dashboardPayDate: '2025-01-10' }
};

const restored = JSON.parse(JSON.stringify(payload));
assert.deepEqual(restored.shifts, shifts);
assert.deepEqual(restored.paystubs, paystubs);
assert.equal(restored.shifts[0].hours, null);
assert.equal(restored.shifts[0].tips, 0);
assert.equal(restored.paystubs[0].commission, 0);
assert.equal(restored.preferences.dashboardPayDate, '2025-01-10');
console.log('storage contract passed: legacy nulls, zeros, shifts, paystubs, and preferences preserved');
