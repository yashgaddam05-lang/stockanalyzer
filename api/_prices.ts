// Plan prices: one place, no dependencies, so the billing code and the OKF bundle (scripts/okf) both read it.
export const PLAN_PRICES = {
  pro: {
    month: { lookupKey: '3xh_pro_monthly', amount: 1900, label: '$19 / month' },
    year: { lookupKey: '3xh_pro_annual', amount: 14900, label: '$149 / year' },
  },
  pro_plus: {
    month: { lookupKey: '3xh_plus_monthly', amount: 4900, label: '$49 / month' },
    year: { lookupKey: '3xh_plus_annual', amount: 39900, label: '$399 / year' },
  },
} as const;
