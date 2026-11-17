import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind class names, resolving conflicts in favour of the
 * right-most utility. The standard `shadcn/ui` helper.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a JS Date as `YYYY-MM-DD` using its **local** fields. This is
 * the canonical day key shared with the server.
 */
export function toDayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Two-letter initials for avatar fallbacks. Returns a middle dot when
 * there is no usable name.
 */
export function getInitials(name?: string): string {
  if (!name) return '·';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '·'
  );
}

/**
 * Pretty-printer for ISO timestamps used across admin tables.
 * Falls back to an em dash for missing/invalid input.
 */
export function formatRelative(value: string | Date | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return d.toLocaleDateString();
}
