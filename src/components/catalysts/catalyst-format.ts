import {
  Building2,
  CalendarClock,
  FlaskConical,
  Landmark,
  Mic,
  Package,
  Tag,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Catalyst, CatalystType } from '@/lib/supabase';

export const CATALYST_TYPES: CatalystType[] = [
  'earnings',
  'product',
  'regulatory',
  'clinical',
  'conference',
  'corporate',
  'other',
];

export const CATALYST_TYPE_LABELS: Record<CatalystType, string> = {
  earnings: 'Earnings',
  product: 'Product',
  regulatory: 'Regulatory',
  clinical: 'Clinical',
  conference: 'Conference',
  corporate: 'Corporate',
  other: 'Other',
};

export const CATALYST_TYPE_ICONS: Record<CatalystType, LucideIcon> = {
  earnings: CalendarClock,
  product: Package,
  regulatory: Landmark,
  clinical: FlaskConical,
  conference: Mic,
  corporate: Building2,
  other: Tag,
};

export function isCatalystType(value: unknown): value is CatalystType {
  return typeof value === 'string' && (CATALYST_TYPES as string[]).includes(value);
}

const DAY_MS = 86_400_000;

/** Parses a YYYY-MM-DD string as a local calendar date. Returns null when invalid. */
export function parseISODate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** Formats a Date as local YYYY-MM-DD. */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const next = startOfDay(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Whole calendar days from today until `date` (negative when in the past). NaN when invalid. */
export function daysUntil(date: string, now: Date = new Date()): number {
  const target = parseISODate(date);
  if (!target) return Number.NaN;
  return Math.round((target.getTime() - startOfDay(now).getTime()) / DAY_MS);
}

/** 'today', 'tomorrow', 'in 3 days', 'yesterday', '12 days ago'. */
export function relativeLabel(date: string, now: Date = new Date()): string {
  const days = daysUntil(date, now);
  if (Number.isNaN(days)) return '';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 0) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
}

export function formatCatalystDate(date: string): string {
  const parsed = parseISODate(date);
  if (!parsed) return date;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

export interface CatalystWeekGroup<T extends Catalyst = Catalyst> {
  /** YYYY-MM-DD of the week's Monday */
  key: string;
  label: string;
  items: T[];
}

function weekLabel(monday: Date, now: Date): string {
  const thisWeek = startOfWeek(now).getTime();
  const diffWeeks = Math.round((monday.getTime() - thisWeek) / (7 * DAY_MS));
  if (diffWeeks === 0) return 'This week';
  if (diffWeeks === 1) return 'Next week';
  if (diffWeeks === -1) return 'Last week';
  const sameYear = monday.getFullYear() === now.getFullYear();
  return `Week of ${monday.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })}`;
}

/** Groups catalysts by Monday-start week, sorted ascending by date. Invalid dates are dropped. */
export function groupByWeek<T extends Catalyst>(rows: T[], now: Date = new Date()): CatalystWeekGroup<T>[] {
  const groups = new Map<string, CatalystWeekGroup<T>>();
  const sorted = [...rows].sort((a, b) => a.event_date.localeCompare(b.event_date) || a.ticker.localeCompare(b.ticker));
  for (const row of sorted) {
    const date = parseISODate(row.event_date);
    if (!date) continue;
    const monday = startOfWeek(date);
    const key = toISODate(monday);
    let group = groups.get(key);
    if (!group) {
      group = { key, label: weekLabel(monday, now), items: [] };
      groups.set(key, group);
    }
    group.items.push(row);
  }
  return [...groups.values()];
}

export const TICKER_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/;
export const TITLE_MAX = 200;
export const NOTES_MAX = 1000;
export const SOURCE_URL_MAX = 500;

export interface CatalystFormValues {
  ticker: string;
  event_type: string;
  title: string;
  event_date: string;
  date_status: string;
  source_url: string;
  notes: string;
}

export type CatalystFormErrors = Partial<Record<keyof CatalystFormValues, string>>;

/** Client-side mirror of the catalysts API / table constraints. Empty object means valid. */
export function validateCatalystForm(values: CatalystFormValues, now: Date = new Date()): CatalystFormErrors {
  const errors: CatalystFormErrors = {};
  const ticker = values.ticker.trim().toUpperCase();
  if (!ticker) errors.ticker = 'Ticker is required.';
  else if (!TICKER_PATTERN.test(ticker)) errors.ticker = 'Ticker must be 1-10 characters: letters, digits, "." or "-".';

  if (!isCatalystType(values.event_type)) errors.event_type = 'Choose an event type.';

  const title = values.title.trim();
  if (!title) errors.title = 'Title is required.';
  else if (title.length > TITLE_MAX) errors.title = `Title must be ${TITLE_MAX} characters or fewer.`;

  if (!values.event_date) errors.event_date = 'Date is required.';
  else {
    const days = daysUntil(values.event_date, now);
    if (Number.isNaN(days)) errors.event_date = 'Enter a valid date (YYYY-MM-DD).';
    else {
      const maxDays = daysUntil(toISODate(new Date(now.getFullYear() + 3, now.getMonth(), now.getDate())), now);
      if (days < -365 || days > maxDays) errors.event_date = 'Date must be within the past year and the next 3 years.';
    }
  }

  if (values.date_status !== 'confirmed' && values.date_status !== 'estimated') {
    errors.date_status = 'Choose confirmed or estimated.';
  }

  const url = values.source_url.trim();
  if (url) {
    if (!/^https?:\/\//i.test(url)) errors.source_url = 'Source URL must start with http:// or https://.';
    else if (url.length > SOURCE_URL_MAX) errors.source_url = `Source URL must be at most ${SOURCE_URL_MAX} characters.`;
    else {
      try {
        new URL(url);
      } catch {
        errors.source_url = 'Enter a valid URL.';
      }
    }
  }

  if (values.notes.length > NOTES_MAX) errors.notes = `Notes must be ${NOTES_MAX} characters or fewer.`;
  return errors;
}
