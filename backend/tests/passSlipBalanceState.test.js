const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseMeridiemTimeToDate } = require('../utils/dateTime');
const { computeReturnBalanceAdjustment } = require('../utils/passSlipBalance');
const {
  getPassSlipSeconds,
  getStoredPassSlipSeconds,
  setPassSlipSeconds,
} = require('../utils/passSlipBalanceState');

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

describe('computeReturnBalanceAdjustment — 2 hour slip', () => {
  it('credits ~119 minutes when employee returns after 1 minute on a 2-hour slip', () => {
    const slip = makeSlip({
      timeOut: '9:00 AM',
      estimatedTimeBack: '11:00 AM',
      departureTime: at('9:00 AM'),
    });
    const arrival = at('9:01 AM');

    const result = computeReturnBalanceAdjustment(slip, arrival);

    assert.equal(result.plannedMinutes, 120);
    assert.equal(result.actualMinutes, 1);
    assert.equal(result.adjustment, 7140);
    assert.equal(result.overdueMinutes, 0);
  });
});

describe('getPassSlipSeconds', () => {
  it('returns 0 when both fields are zero after full deduction', () => {
    assert.equal(getPassSlipSeconds({ passSlipSeconds: 0, passSlipMinutes: 0 }), 0);
  });

  it('returns credited balance after early return', () => {
    assert.equal(getPassSlipSeconds({ passSlipSeconds: 7140, passSlipMinutes: 119 }), 7140);
  });

  it('returns stored seconds for desynced 7200/0 legacy rows (not 0)', () => {
    assert.equal(getPassSlipSeconds({ passSlipSeconds: 7200, passSlipMinutes: 0 }), 7200);
    assert.equal(getStoredPassSlipSeconds({ passSlipSeconds: 7200, passSlipMinutes: 0 }), 7200);
  });

  it('setPassSlipSeconds keeps minutes in sync with seconds', () => {
    const user = { passSlipSeconds: 0, passSlipMinutes: 0 };
    const normalized = setPassSlipSeconds(user, 7140);
    assert.equal(normalized, 7140);
    assert.equal(user.passSlipSeconds, 7140);
    assert.equal(user.passSlipMinutes, 119);
    assert.equal(getPassSlipSeconds(user), 7140);
  });
});

describe('return credit simulation', () => {
  it('applies early-return credit from zero balance correctly', () => {
    const employee = { passSlipSeconds: 0, passSlipMinutes: 0 };
    const adjustment = 7140;
    const updated = setPassSlipSeconds(
      employee,
      getStoredPassSlipSeconds(employee) + adjustment,
    );
    assert.equal(updated, 7140);
    assert.equal(getPassSlipSeconds(employee), 7140);
  });
});
