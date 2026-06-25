import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { DOWNLOAD_ROOT, KEYWORDS, CHUNK_REPORT_REGEX, REPORT_FILE } from './utils/keywords';

type ChunkEntry = { file: string; method: 'text' | 'ocr' };
type ChunkReport = {
  chunk: number;
  byKeyword: { keyword: string; folder: string; matched: ChunkEntry[]; notMatched: ChunkEntry[] }[];
  multiMatches: { file: string; method: 'text' | 'ocr'; count: number; keys: string[] }[];
  failed: { file: string; error: string }[];
};

// Runs once all chunk workers (pdf-keyword-search.spec.ts) finish, combining their
// per-chunk keyword-matches.chunk-N.json files into a single report keyed by keyword.
test('merge per-chunk keyword reports', async () => {
  expect(fs.existsSync(DOWNLOAD_ROOT), `${DOWNLOAD_ROOT} does not exist — run pdf-download.spec.ts first`).toBeTruthy();

  const chunkReports: ChunkReport[] = fs
    .readdirSync(DOWNLOAD_ROOT)
    .filter((name) => CHUNK_REPORT_REGEX.test(name))
    .map((name) => JSON.parse(fs.readFileSync(path.join(DOWNLOAD_ROOT, name), 'utf-8')))
    .sort((a, b) => a.chunk - b.chunk);

  expect(chunkReports.length, 'no chunk reports found — run pdf-keyword-search.spec.ts first').toBeGreaterThan(0);

  const byKeyword = KEYWORDS.map(({ key, folder }) => {
    const matched = chunkReports.flatMap((report) => report.byKeyword.find((k) => k.keyword === key)?.matched ?? []);
    const notMatched = chunkReports.flatMap((report) => report.byKeyword.find((k) => k.keyword === key)?.notMatched ?? []);
    return { keyword: key, folder, matchedCount: matched.length, notMatchedCount: notMatched.length, matched, notMatched };
  });

  const multiMatches = chunkReports.flatMap((report) => report.multiMatches);
  const failed = chunkReports.flatMap((report) => report.failed);

  const report = { chunksMerged: chunkReports.length, byKeyword, multiMatches, failed };
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  await test.info().attach('keyword-matches.json', { path: REPORT_FILE, contentType: 'application/json' });

  console.log(`[report] merged ${chunkReports.length} chunk report(s) -> downloads/keyword-matches.json`);
  for (const { keyword, folder, matchedCount } of byKeyword) {
    console.log(`  "${keyword}" -> downloads/${folder}/: ${matchedCount}`);
  }
  if (failed.length > 0) {
    console.log(`  failed -> downloads/failed/: ${failed.length}`);
  }
});
