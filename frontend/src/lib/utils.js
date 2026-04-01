import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes safely. */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/** Format a decimal number as currency. */
export function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value ?? 0);
}

/** Format a date string or Date to locale short date. */
export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Round to 1 decimal place. */
export function round1(value) {
  return Math.round((value ?? 0) * 10) / 10;
}
