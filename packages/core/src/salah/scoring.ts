import {
  JUMMAH_SUNNAH_RAKAH,
  PRAYER_SUNNAH_RAKAH,
  type PrayerName,
  type SalahScoring,
} from './constants.js';

/**
 * Pure helpers to compute a day's running and maximum possible points
 * from a `SalahScoring` config.
 *
 * Previously these lived only in the client as a hand-maintained mirror
 * of the server's calculator. They now live here so both sides share one
 * implementation.
 *
 * `sunnahBefore` and `sunnahAfter` are points PER RAKAH — every helper
 * here multiplies them by the per-prayer rakah counts. A prayer that
 * doesn't have a given sunnah (e.g. Fajr's "after") contributes nothing.
 */

/** Highest reward a single fard can give on a regular waqt. */
export function bestFard(scoring: SalahScoring): number {
  return Math.max(scoring.fardAwwal, scoring.fardMid, scoring.fardLast);
}

/** Highest possible reward from a specific regular waqt prayer. */
export function maxPrayer(prayer: PrayerName, scoring: SalahScoring): number {
  const rakah = PRAYER_SUNNAH_RAKAH[prayer];
  return (
    bestFard(scoring) +
    Math.max(0, scoring.sunnahBefore) * rakah.before +
    Math.max(0, scoring.sunnahAfter) * rakah.after +
    Math.max(0, scoring.nafl)
  );
}

/** Highest possible reward from a single Jummah. */
export function maxJummah(scoring: SalahScoring): number {
  return (
    Math.max(0, scoring.jummahFard) +
    Math.max(0, scoring.sunnahBefore) * JUMMAH_SUNNAH_RAKAH.before +
    Math.max(0, scoring.sunnahAfter) * JUMMAH_SUNNAH_RAKAH.after +
    Math.max(0, scoring.nafl) +
    Math.max(0, scoring.jummahKhutbah) +
    Math.max(0, scoring.jummahEarly) +
    Math.max(0, scoring.jummahSurahKahf) +
    Math.max(0, scoring.jummahGhusl)
  );
}

/** Maximum total Salah points achievable on the given day. */
export function maxDailyPoints(scoring: SalahScoring, isFriday: boolean): number {
  const witr = Math.max(0, scoring.witr);
  if (isFriday) {
    // 4 regular waqts (Fajr, Asr, Maghrib, Isha) + Jummah + Witr
    return (
      maxPrayer('fajr', scoring) +
      maxPrayer('asr', scoring) +
      maxPrayer('maghrib', scoring) +
      maxPrayer('isha', scoring) +
      maxJummah(scoring) +
      witr
    );
  }
  return (
    maxPrayer('fajr', scoring) +
    maxPrayer('dhuhr', scoring) +
    maxPrayer('asr', scoring) +
    maxPrayer('maghrib', scoring) +
    maxPrayer('isha', scoring) +
    witr
  );
}
