import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

function appFor(runsDir: string) {
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
}

function tempRuns(): string {
  return mkdtempSync(join(tmpdir(), 'rig-runs-'));
}

describe('digest routes', () => {
  it('returns 200 for a night with a bad line, and JSON matches the page order', async () => {
    const dir = tempRuns();
    copyFileSync('runs/2026-10-28.jsonl', join(dir, '2026-10-28.jsonl'));
    const app = appFor(dir);

    const page = await app.request('/digest/2026-10-28');
    const json = await app.request('/api/digest/2026-10-28');
    expect(page.status).toBe(200);
    expect(json.status).toBe(200);

    const html = await page.text();
    const rows = (await json.json()) as DigestRow[];
    expect(rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    let cursor = 0;
    for (const job of rows.map((r) => r.job)) {
      const at = html.indexOf(job, cursor);
      expect(at).toBeGreaterThanOrEqual(0);
      cursor = at + job.length;
    }
  });

  it('returns 404 when the night file is missing', async () => {
    const app = appFor(tempRuns());
    expect((await app.request('/digest/2026-10-28')).status).toBe(404);
    expect((await app.request('/api/digest/2026-10-28')).status).toBe(404);
  });

  it('renders an empty night as nothing ran', async () => {
    const dir = tempRuns();
    writeFileSync(join(dir, '2026-10-30.jsonl'), '');
    const app = appFor(dir);

    const page = await app.request('/digest/2026-10-30');
    const json = await app.request('/api/digest/2026-10-30');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');
    expect(json.status).toBe(200);
    expect(await json.json()).toEqual([]);
  });
});
