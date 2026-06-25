import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { DOWNLOAD_ROOT, KEYWORDS, CHUNK_REPORT_REGEX, REPORT_FILE } from './utils/keywords';

type ChunkReport = {
  chunk: number;
  matches: Record<string, string[]>;
  failed: string[];
};

// Runs once all chunk workers (pdf-keyword-search.spec.ts) finish, combining their
// per-chunk keyword-matches.chunk-N.json files into a single report.
test('merge per-chunk keyword reports', async () => {
  expect(fs.existsSync(DOWNLOAD_ROOT), `${DOWNLOAD_ROOT} does not exist — run pdf-download.spec.ts first`).toBeTruthy();

  const chunkReports: ChunkReport[] = fs
    .readdirSync(DOWNLOAD_ROOT)
    .filter((name) => CHUNK_REPORT_REGEX.test(name))
    .map((name) => JSON.parse(fs.readFileSync(path.join(DOWNLOAD_ROOT, name), 'utf-8')))
    .sort((a, b) => a.chunk - b.chunk);

  expect(chunkReports.length, 'no chunk reports found — run pdf-keyword-search.spec.ts first').toBeGreaterThan(0);

  const failed = chunkReports.flatMap((report) => report.failed);

  const report: Record<string, string[]> = { failed };
  for (const { label } of KEYWORDS) {
    const matched = chunkReports.flatMap((r) => r.matches[label] ?? []);
    if (matched.length > 0) report[label] = matched;
  }

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  await test.info().attach('keyword-matches.json', { path: REPORT_FILE, contentType: 'application/json' });

  console.log(`[report] merged ${chunkReports.length} chunk report(s) -> downloads/keyword-matches.json`);
  for (const { label } of KEYWORDS) {
    console.log(`  "${label}" -> ${report[label]?.length ?? 0}`);
  }
  if (failed.length > 0) {
    console.log(`  failed to read: ${failed.length}`);
  }
});
