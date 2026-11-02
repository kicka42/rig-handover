import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import type { JobStatus } from './digest/types.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type NightLink = {
  night: string;
  ok: number;
  retry: number;
  fail: number;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightLink[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

function countsFor(runsDir: string, night: string): NightLink {
  const digest = readNight(runsDir, night);
  const counts: Record<JobStatus, number> = { ok: 0, retry: 0, fail: 0 };
  if (digest) {
    for (const row of digest.rows) counts[row.lastStatus] += 1;
  }
  return { night, ...counts };
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((night) => countsFor(config.runsDir, night)),
  };
}
