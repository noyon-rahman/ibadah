import { readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { Release } from '@/modules/release/release.model';
import { logger } from '@/utils/logger';

interface ChangelogEntry {
  category: 'feature' | 'fix' | 'enhancement';
  title: string;
  scope?: string;
}

interface ChangelogRelease {
  version: string;
  date: string;
  entries: ChangelogEntry[];
}

export const releaseService = {
  /**
   * Paginated query for releases, sorted by date descending (newest first).
   */
  async getReleases(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      Release.find().sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      Release.countDocuments(),
    ]);
    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Seed releases from the generated changelog.json into MongoDB.
   * Idempotent — upserts by version and updates entries/dates on every startup.
   */
  async seedReleases(): Promise<void> {
    // Resolve relative to this module, not process.cwd(): the compiled file sits
    // beside changelog.json in dist/, but the process may be started from the
    // repo root (e.g. in a container), where a cwd-relative lookup misses it.
    const moduleDir = dirname(fileURLToPath(import.meta.url));

    // Try multiple paths for the changelog file. The build emits it to
    // dist/changelog.json while this module lands in dist/modules/release/,
    // so walk up two levels before falling back to cwd-relative lookups.
    const candidates = [
      resolve(moduleDir, '..', '..', 'changelog.json'), // dist/changelog.json
      resolve(process.cwd(), 'dist', 'changelog.json'),
      resolve(process.cwd(), 'src', 'data', 'changelog.json'),
      resolve(process.cwd(), 'changelog.json'),
    ];

    let changelogPath: string | null = null;
    for (const p of candidates) {
      if (existsSync(p)) {
        changelogPath = p;
        break;
      }
    }

    if (!changelogPath) {
      logger.warn('[releases] No changelog.json found — skipping seed');
      return;
    }

    let releases: ChangelogRelease[];
    try {
      const raw = readFileSync(changelogPath, 'utf-8');
      releases = JSON.parse(raw) as ChangelogRelease[];
    } catch (err) {
      logger.warn('[releases] Failed to parse changelog.json — skipping seed', err);
      return;
    }

    if (releases.length === 0) {
      logger.info('[releases] Changelog is empty — nothing to seed');
      return;
    }

    let upsertedCount = 0;
    for (const release of releases) {
      await Release.findOneAndUpdate(
        { version: release.version },
        {
          $set: {
            date: new Date(release.date),
            entries: release.entries,
          },
        },
        { upsert: true, new: true },
      );
      upsertedCount++;

      // If official release tagged version is present (e.g., "0.3.0"),
      // clean up any obsolete "(Unreleased)" variant (e.g., "0.3.0 (Unreleased)")
      if (!release.version.includes('(Unreleased)')) {
        const unreleasedVariant = `${release.version} (Unreleased)`;
        await Release.deleteOne({ version: unreleasedVariant });
      }
    }

    logger.info(`[releases] Synchronized ${upsertedCount} release(s) with database`);
  },
};
