/**
 * Salah scoring config — re-exported from `@ibadah/core`.
 *
 * The canonical definitions live in `packages/core/src/salah/constants.ts`
 * so the server, client and admin share one source. Import from here
 * (or from `@ibadah/core` directly) inside the server module.
 */
export {
  SALAH_DEFAULT_POINTS,
  SALAH_DEFAULT_SCORING,
  PRAYER_NAMES,
  PRAYER_SUNNAH_RAKAH,
  JUMMAH_SUNNAH_RAKAH,
  PRAYER_STATUSES,
  JUMMAH_FLAGS,
  PRAYER_FLAGS,
  hasSunnahBefore,
  hasSunnahAfter,
  isFridayDayKey,
} from '@ibadah/core';

export type {
  SalahScoring,
  PrayerName,
  PrayerStatus,
  JummahFlag,
  PrayerFlag,
} from '@ibadah/core';
