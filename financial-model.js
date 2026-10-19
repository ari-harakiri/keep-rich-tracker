(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  root.KeepRichFinancialModel = model;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const COMMISSION_RATE = 0.015;
  const DAY_MS = 86400000;
  const known = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const roundMoney = value => {
    const amount = Number(value);
    return Math.sign(amount) * Math.round((Math.abs(amount) + 1e-10) * 100) / 100;
  };

  function utcDay(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    const [year, month, day] = value.split('-').map(Number);
    const time = Date.UTC(year, month - 1, day);
    return new Date(time).toISOString().slice(0, 10) === value ? time : null;
  }

  function isoDay(time) {
    return new Date(time).toISOString().slice(0, 10);
  }

  function scheduledPayDate(shiftTime, schedule) {
    const anchorTime = utcDay(schedule?.payDate);
    const frequency = schedule?.frequency;
    if (anchorTime === null) return null;
    const intervalDays = { weekly: 7, biweekly: 14, fourWeekly: 28 }[frequency];
    if (intervalDays) {
      const cycles = Math.ceil((shiftTime - anchorTime) / (intervalDays * DAY_MS));
      return isoDay(anchorTime + cycles * intervalDays * DAY_MS);
    }
    if (frequency === 'monthly') {
      const shift = new Date(shiftTime);
      const anchor = new Date(anchorTime);
      const paydayFor = (year, month) => {
        const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        return Date.UTC(year, month, Math.min(anchor.getUTCDate(), lastDay));
      };
      let candidate = paydayFor(shift.getUTCFullYear(), shift.getUTCMonth());
      if (candidate < shiftTime) candidate = paydayFor(shift.getUTCFullYear(), shift.getUTCMonth() + 1);
      return isoDay(candidate);
    }
    return null;
  }

  function scheduleFromPaystubs(paystubs) {
    const schedules = (Array.isArray(paystubs) ? paystubs : []).map(stub => {
      const payTime = utcDay(stub?.payDate);
      const startTime = utcDay(stub?.periodStart);
      const endTime = utcDay(stub?.periodEnd);
      if (payTime === null || startTime === null || endTime === null || startTime > endTime) return null;
      const spanDays = Math.round((endTime - startTime) / DAY_MS);
      const frequency = [6, 7].includes(spanDays) ? 'weekly' : spanDays >= 13 && spanDays <= 15 ? 'biweekly' : spanDays === 27 ? 'fourWeekly' : spanDays >= 28 && spanDays <= 31 ? 'monthly' : null;
      return frequency ? { payDate: stub.payDate, frequency, source: 'paystub', payTime } : null;
    }).filter(Boolean).sort((a, b) => b.payTime - a.payTime);
    if (!schedules.length) return null;
    const { payDate, frequency, source } = schedules[0];
    return { payDate, frequency, source };
  }

  function inferPayDate(shiftDate, paystubs, schedule) {
    const shiftTime = utcDay(shiftDate);
    if (shiftTime === null) return null;
    if (schedule?.source === 'manual') return scheduledPayDate(shiftTime, schedule);
    const anchors = (Array.isArray(paystubs) ? paystubs : []).map(stub => ({
      payDate: stub?.payDate,
      payTime: utcDay(stub?.payDate),
      startTime: utcDay(stub?.periodStart),
      endTime: utcDay(stub?.periodEnd)
    })).filter(anchor => anchor.payTime !== null && anchor.startTime !== null && anchor.endTime !== null && anchor.startTime <= anchor.endTime);
    const direct = anchors.find(anchor => shiftTime >= anchor.startTime && shiftTime <= anchor.endTime);
    if (direct) return direct.payDate;
    const repeating = anchors.map(anchor => {
      const learned = scheduleFromPaystubs([{ payDate: anchor.payDate, periodStart: isoDay(anchor.startTime), periodEnd: isoDay(anchor.endTime) }]);
      return { ...anchor, cycleDays: { weekly: 7, biweekly: 14, fourWeekly: 28 }[learned?.frequency] };
    }).filter(anchor => anchor.cycleDays);
    if (repeating.length) {
      repeating.sort((a, b) => Math.abs(shiftTime - a.startTime) - Math.abs(shiftTime - b.startTime));
      const anchor = repeating[0];
      const cycle = Math.floor((shiftTime - anchor.startTime) / (anchor.cycleDays * DAY_MS));
      return isoDay(anchor.payTime + cycle * anchor.cycleDays * DAY_MS);
    }
    return scheduledPayDate(shiftTime, schedule || scheduleFromPaystubs(paystubs));
  }

  function sumKnown(rows, key) {
    const values = rows.map(row => row?.[key]).filter(known).map(Number);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  }

  function strictSum(rows, key) {
    if (!rows.length || rows.some(row => !known(row?.[key]))) return null;
    return rows.reduce((sum, row) => sum + Number(row[key]), 0);
  }

  function commissionFromShifts(shifts) {
    const salesShiftTypes = new Set(['budtending', 'express']);
    const nonSalesShiftTypes = new Set(['inventory', 'reception']);
    const eligibleRows = shifts.filter(shift => salesShiftTypes.has(shift?.shiftType));
    const commissionRows = shifts.filter(shift => salesShiftTypes.has(shift?.shiftType) ||
      (!nonSalesShiftTypes.has(shift?.shiftType) && known(shift?.sales)));
    const salesRows = commissionRows.filter(shift => known(shift?.sales));
    const sales = salesRows.length ? roundMoney(salesRows.reduce((sum, shift) => sum + Number(shift.sales), 0)) : null;
    return {
      sales,
      expected: known(sales) ? roundMoney(sales * COMMISSION_RATE) : null,
      complete: salesRows.length > 0 && eligibleRows.every(shift => known(shift?.sales))
    };
  }

  function projectedShiftEarnings(shifts) {
    const rows = Array.isArray(shifts) ? shifts : [];
    const earnings = rows.map(shift => known(shift?.hours) && known(shift?.hourlyWage)
      ? Number(shift.hours) * Number(shift.hourlyWage) + (known(shift?.tips) ? Number(shift.tips) : 0)
      : null);
    if (!earnings.length || earnings.some(value => value === null)) return null;
    const commission = commissionFromShifts(rows).expected;
    return roundMoney(earnings.reduce((sum, value) => sum + value, 0) + (known(commission) ? commission : 0));
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
    inferPayDate,
    scheduleFromPaystubs,
    commissionFromShifts,
    projectedShiftEarnings,
    matchShiftsToPaystub,
    summarizeSelection,
    provisionalShiftSummary
  };
});
