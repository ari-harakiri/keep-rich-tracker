(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  root.KeepRichFinancialModel = model;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const COMMISSION_RATE = 0.015;
  const known = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

  function sumKnown(rows, key) {
    const values = rows.map(row => row?.[key]).filter(known).map(Number);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  }

  function strictSum(rows, key) {
    if (!rows.length || rows.some(row => !known(row?.[key]))) return null;
    return rows.reduce((sum, row) => sum + Number(row[key]), 0);
  }

  function commissionFromShifts(shifts) {
    const salesRows = shifts.filter(shift => known(shift?.sales));
    const sales = salesRows.length ? roundMoney(salesRows.reduce((sum, shift) => sum + Number(shift.sales), 0)) : null;
    return {
      sales,
      expected: known(sales) ? roundMoney(sales * COMMISSION_RATE) : null,
      complete: shifts.length > 0 && salesRows.length === shifts.length
    };
  }

  function matchShiftsToPaystub(paystub, shifts) {
    const rows = Array.isArray(shifts) ? shifts : [];
    const periodStart = paystub?.periodStart;
    const periodEnd = paystub?.periodEnd;
    if (periodStart && periodEnd) {
      return rows.filter(shift => shift?.date && shift.date >= periodStart && shift.date <= periodEnd);
    }
    return paystub?.payDate ? rows.filter(shift => shift?.payDate === paystub.payDate) : [];
  }

  function summarizeSelection(paystubs, shifts) {
    const stubs = Array.isArray(paystubs) ? paystubs : [];
    const rows = Array.isArray(shifts) ? shifts : [];
    const commission = commissionFromShifts(rows);
    const tips = sumKnown(rows, 'tips');
    const tipsComplete = rows.length > 0 && rows.every(shift => known(shift?.tips));
    const loggedHours = sumKnown(rows, 'hours');
    const loggedHoursComplete = rows.length > 0 && rows.every(shift => known(shift?.hours));
    const hasPaystub = stubs.length > 0;
    const payrollHours = hasPaystub ? strictSum(stubs, 'hours') : null;
    const gross = hasPaystub ? strictSum(stubs, 'gross') : null;
    const net = hasPaystub ? strictSum(stubs, 'net') : null;
    const actualCommission = hasPaystub ? strictSum(stubs, 'commission') : null;
    const otherHours = known(payrollHours) && known(loggedHours) && loggedHoursComplete && loggedHours <= payrollHours
      ? payrollHours - loggedHours
      : null;
    const hoursDiscrepancy = known(payrollHours) && known(loggedHours) && loggedHoursComplete && loggedHours > payrollHours
      ? loggedHours - payrollHours
      : null;
    const grossWithTips = known(gross) && known(tips) && tipsComplete ? roundMoney(gross + tips) : null;
    const netWithTips = known(net) && known(tips) && tipsComplete ? roundMoney(net + tips) : null;
    const effectiveGrossHourly = known(grossWithTips) && known(payrollHours) && payrollHours > 0
      ? roundMoney(grossWithTips / payrollHours)
      : null;
    const commissionComplete = hasPaystub && commission.complete && known(actualCommission);
    const commissionDifference = commissionComplete ? roundMoney(actualCommission - commission.expected) : null;
    const financialComplete = commissionComplete && tipsComplete && loggedHoursComplete &&
      known(payrollHours) && known(gross) && known(net);

    let status = 'incomplete';
    if (financialComplete && known(hoursDiscrepancy)) status = 'difference';
    else if (financialComplete && known(otherHours)) status = Math.abs(commissionDifference) < 0.01 ? 'verified' : 'difference';

    return {
      hasPaystub,
      status,
      sales: commission.sales,
      expectedCommission: commission.expected,
      actualCommission,
      commissionDifference,
      commissionComplete,
      financialComplete,
      tips,
      tipsComplete,
      payrollHours,
      loggedHours,
      loggedHoursComplete,
      otherHours,
      hoursDiscrepancy,
      gross,
      net,
      grossWithTips,
      netWithTips,
      effectiveGrossHourly
    };
  }

  function provisionalShiftSummary(shifts) {
    const rows = Array.isArray(shifts) ? shifts : [];
    const wages = rows.map(shift => known(shift?.hours) && known(shift?.hourlyWage)
      ? Number(shift.hours) * Number(shift.hourlyWage)
      : null);
    const wageTotal = wages.length && wages.every(known) ? roundMoney(wages.reduce((sum, value) => sum + value, 0)) : null;
    const tips = sumKnown(rows, 'tips');
    const tipsComplete = rows.length > 0 && rows.every(shift => known(shift?.tips));
    return {
      ...commissionFromShifts(rows),
      tips,
      tipsComplete,
      loggedHours: sumKnown(rows, 'hours'),
      loggedHoursComplete: rows.length > 0 && rows.every(shift => known(shift?.hours)),
      provisionalWages: wageTotal,
      provisionalGrossWithTips: known(wageTotal) && known(tips) && tipsComplete ? roundMoney(wageTotal + tips) : null
    };
  }

  return {
    COMMISSION_RATE,
    known,
    roundMoney,
    sumKnown,
    strictSum,
    commissionFromShifts,
    matchShiftsToPaystub,
    summarizeSelection,
    provisionalShiftSummary
  };
});
