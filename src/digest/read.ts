import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, JobStatus, ReadNight } from './types.js';

const STATUSES: Record<JobStatus, true> = { ok: true, retry: true, fail: true };

function isStatus(value: unknown): value is JobStatus {
  return typeof value === 'string' && value in STATUSES;
}

type Event = {
  at: string;
  job: string;
  status: JobStatus;
  owner: string | null;
  error?: string;
};

function parseEvent(line: string): Event | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.at !== 'string' || typeof row.job !== 'string' || !isStatus(row.status)) {
    return null;
  }
  if (row.owner != null && typeof row.owner !== 'string') return null;
  if (row.error !== undefined && typeof row.error !== 'string') return null;
  const event: Event = {
    at: row.at,
    job: row.job,
    status: row.status,
    owner: typeof row.owner === 'string' ? row.owner : null,
  };
  if (row.error !== undefined) event.error = row.error;
  return event;
}

function applyEvent(existing: DigestRow, event: Event): void {
  existing.runs += 1;
  if (event.status === 'retry') existing.retries += 1;
  existing.owner = event.owner;
  existing.lastStatus = event.status;
  existing.lastError = event.error ?? null;
  existing.lastAt = event.at;
}

export const readNight: ReadNight = (runsDir, night) => {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }

  const byJob = new Map<string, DigestRow>();
  let badLines = 0;

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const event = parseEvent(line);
    if (!event) {
      badLines += 1;
      continue;
    }
    const existing = byJob.get(event.job);
    if (!existing) {
      byJob.set(event.job, {
        job: event.job,
        owner: event.owner,
        runs: 1,
        retries: event.status === 'retry' ? 1 : 0,
        lastStatus: event.status,
        lastError: event.error ?? null,
        firstAt: event.at,
        lastAt: event.at,
      });
      continue;
    }
    applyEvent(existing, event);
  }

  const rows = [...byJob.values()].sort((a, b) => a.job.localeCompare(b.job));
  return { night, rows, badLines };
};
