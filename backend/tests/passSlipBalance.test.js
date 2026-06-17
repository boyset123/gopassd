const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseMeridiemTimeToDate } = require('../utils/dateTime');
const {
  computeReturnBalanceAdjustment,
  formatReturnAuditDetails,
} = require('../utils/passSlipBalance');

const SLIP_DATE = '2026-06-17';

function makeSlip(overrides = {}) {
  return {
    date: SLIP_DATE,
    timeOut: '10:00 AM',
    estimatedTimeBack: '11:00 AM',
    ...overrides,
  };
}

function at(timeStr) {
  return parseMeridiemTimeToDate(timeStr, SLIP_DATE);
}

describe('computeReturnBalanceAdjustment', () => {
  it('credits unused time when employee returns 30 minutes early on a 1-hour slip', () => {
    const slip = makeSlip({
      departureTime: at('10:00 AM'),
    });
    const arrival = at('10:30 AM');

    const result = computeReturnBalanceAdjustment(slip, arrival);

    assert.equal(result.plannedMinutes, 60);
    assert.equal(result.actualMinutes, 30);
    assert.equal(result.adjustment, 1800);
    assert.equal(result.overdueMinutes, 0);
  });

  it('applies no adjustment when actual use matches planned duration', () => {
    const slip = makeSlip({
      departureTime: at('10:00 AM'),
    });
    const arrival = at('11:00 AM');

    const result = computeReturnBalanceAdjustment(slip, arrival);

    assert.equal(result.actualMinutes, 60);
    assert.equal(result.adjustment, 0);
    assert.equal(result.overdueMinutes, 0);
  });

  it('deducts overdue time when employee returns after estimated time back', () => {
    const slip = makeSlip({
      departureTime: at('10:00 AM'),
    });
    const arrival = at('11:30 AM');

    const result = computeReturnBalanceAdjustment(slip, arrival);

    assert.equal(result.actualMinutes, 90);
    assert.equal(result.overdueMinutes, 30);
    assert.equal(result.adjustment, -1800);
  });

  it('excludes lunch break from both planned and actual billable duration', () => {
    const slip = makeSlip({
      timeOut: '11:30 AM',
      estimatedTimeBack: '1:30 PM',
      departureTime: at('11:30 AM'),
    });
    const arrival = at('12:30 PM');

    const result = computeReturnBalanceAdjustment(slip, arrival);

    assert.equal(result.plannedMinutes, 60);
    assert.equal(result.actualMinutes, 30);
    assert.equal(result.adjustment, 1800);
  });
});

describe('formatReturnAuditDetails', () => {
  it('includes duration and credit when balance is restored', () => {
    const details = formatReturnAuditDetails(30, 1800);
    assert.equal(details, 'Duration: 30 min · Balance credited: 30m 0s');
  });

  it('includes duration and debit when employee is overdue', () => {
    const details = formatReturnAuditDetails(90, -1800);
    assert.equal(details, 'Duration: 90 min · Balance deducted: 30m 0s');
  });
});
