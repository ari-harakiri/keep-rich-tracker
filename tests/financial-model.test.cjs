const assert = require('node:assert/strict');
const model = require('../financial-model.js');

function shift(overrides = {}) {
  return { date: '2026-10-01', payDate: '2026-10-16', hours: 8, tips: 0, sales: 0, ...overrides };
}

function stub(overrides = {}) {
  return { payDate: '2026-10-16', hours: 80, commission: 30, gross: 1600, net: 1300, ...overrides };
}

{
  const rows = [shift({ hours: 26, sales: 1000 }), shift({ hours: 26, sales: 1000 })];
  const result = model.summarizeSelection([stub()], rows);
  assert.equal(result.payrollHours, 80);
  assert.equal(result.loggedHours, 52);
  assert.equal(result.otherHours, 28);
}

{
  const rows = [shift({ hours: 52, tips: 185, sales: 2000 })];
  const result = model.summarizeSelection([stub()], rows);
  assert.equal(result.grossWithTips, 1785);
}

{
  const blank = model.commissionFromShifts([shift({ sales: null })]);
  assert.equal(blank.sales, null);
  assert.equal(blank.expected, null);
  assert.equal(blank.complete, false);

  const zero = model.commissionFromShifts([shift({ sales: 0 })]);
  assert.equal(zero.sales, 0);
  assert.equal(zero.expected, 0);
  assert.equal(zero.complete, true);

  const positive = model.commissionFromShifts([shift({ sales: 2000 })]);
  assert.equal(positive.expected, 30);
}

{
  const missingSales = model.summarizeSelection([stub()], [shift({ sales: null })]);
  assert.equal(missingSales.status, 'incomplete');
  assert.equal(missingSales.commissionDifference, null);

  const missingCommission = model.summarizeSelection([stub({ commission: null })], [shift({ sales: 2000 })]);
  assert.equal(missingCommission.status, 'incomplete');
  assert.equal(missingCommission.commissionDifference, null);
}

{
  const paystub = stub({ periodStart: '2026-10-01', periodEnd: '2026-10-15' });
  const rows = [
    shift({ date: '2026-10-01', payDate: null, sales: 1000 }),
    shift({ date: '2026-10-15', payDate: null, sales: 1200 }),
    shift({ date: '2026-10-16', payDate: paystub.payDate, sales: 900 })
  ];
  assert.deepEqual(model.matchShiftsToPaystub(paystub, rows).map(row => row.date), ['2026-10-01', '2026-10-15']);
  assert.deepEqual(model.matchShiftsToPaystub(stub({ periodStart: null, periodEnd: null }), rows).map(row => row.date), ['2026-10-16']);
}

{
  const discrepancy = model.summarizeSelection([stub({ hours: 40 })], [shift({ hours: 52, sales: 2000 })]);
  assert.equal(discrepancy.otherHours, null);
  assert.equal(discrepancy.hoursDiscrepancy, 12);
  assert.equal(discrepancy.status, 'difference');
}

{
  const provisional = model.provisionalShiftSummary([
    shift({ hours: 8, hourlyWage: 20, tips: 30, sales: 1000 })
  ]);
  assert.equal(provisional.loggedHours, 8);
  assert.equal(provisional.provisionalWages, 160);
  assert.equal(provisional.provisionalGrossWithTips, 190);
  assert.equal('payrollHours' in provisional, false);
}

{
  const legacyShift = { id: 'old-1', date: '2025-01-01', payDate: '2025-01-10', hours: 4, tips: null, sales: 0 };
  const legacyStub = { id: 'old-stub', payDate: '2025-01-10', periodStart: null, periodEnd: null, hours: 80, commission: 0, gross: 1500, net: 1200 };
  const roundTrip = JSON.parse(JSON.stringify({ shifts: [legacyShift], paystubs: [legacyStub] }));
  assert.deepEqual(roundTrip.shifts[0], legacyShift);
  assert.deepEqual(roundTrip.paystubs[0], legacyStub);
  assert.equal(model.summarizeSelection(roundTrip.paystubs, roundTrip.shifts).expectedCommission, 0);
}

console.log('financial-model: 9 scenario groups passed');
