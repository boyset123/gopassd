import {
  durationToEquivalentDay,
  formatEquivalentDay,
  hoursToEquivalentDay,
  minutesToEquivalentDay,
} from './serviceCreditsConversion';

export type ServiceCreditEntryType = 'earned' | 'deducted';

export interface ServiceCreditLedgerEntry {
  id: string;
  type: ServiceCreditEntryType;
  title: string;
  detail: string;
  amountDays: number;
  formattedAmount: string;
}

const earned8h = hoursToEquivalentDay(8);
const earned2h = hoursToEquivalentDay(2);
const earned45m = minutesToEquivalentDay(45);
const deductionExcess = durationToEquivalentDay(1, 30);

export const SERVICE_CREDIT_LEDGER: ServiceCreditLedgerEntry[] = [
  {
    id: 'earn-1',
    type: 'earned',
    title: 'Service rendered',
    detail: '8 hours — Jun 17, 2026',
    amountDays: earned8h,
    formattedAmount: `+${formatEquivalentDay(earned8h)}`,
  },
  {
    id: 'earn-2',
    type: 'earned',
    title: 'Service rendered',
    detail: '2 hours — Jun 18, 2026',
    amountDays: earned2h,
    formattedAmount: `+${formatEquivalentDay(earned2h)}`,
  },
  {
    id: 'earn-3',
    type: 'earned',
    title: 'Service rendered',
    detail: '45 minutes — Jun 18, 2026',
    amountDays: earned45m,
    formattedAmount: `+${formatEquivalentDay(earned45m)}`,
  },
  {
    id: 'deduct-1',
    type: 'deducted',
    title: 'Automatic deduction — pass slip exceeded 2 hours',
    detail: '9:00 AM – 12:30 PM (1h 30m excess) — Jun 17, 2026',
    amountDays: -deductionExcess,
    formattedAmount: `−${formatEquivalentDay(deductionExcess)}`,
  },
];

export const SERVICE_CREDIT_BALANCE_DAYS = SERVICE_CREDIT_LEDGER.reduce(
  (sum, entry) => sum + entry.amountDays,
  0,
);
