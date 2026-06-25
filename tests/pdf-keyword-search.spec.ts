import { test, expect } from '@playwright/test';
import { PDFParse } from 'pdf-parse';
import Tesseract from 'tesseract.js';
import fs from 'fs';
import path from 'path';
import { assertPdfIsReadable } from './utils/pdf';
import { DOWNLOAD_ROOT, FILES_FOLDER, KEYWORDS, PROGRESS_FILE } from './utils/keywords';
import { WORKER_COUNT } from './utils/config';

// Workers run as separate processes, so progress is tallied via the shared
// PROGRESS_FILE on disk (one appended byte per file) instead of an in-memory counter.
function reportProgress(total: number) {
  fs.appendFileSync(PROGRESS_FILE, '.');
  const processed = fs.statSync(PROGRESS_FILE).size;
  if (processed % 100 === 0 || processed === total) {
    console.log(`[progress] ${processed}/${total} files processed`);
  }
}

// pdf-parse inserts "-- N of M --" markers between pages even when a scanned
// page has no real text layer, so strip those before judging text density.
function stripPageMarkers(text: string) {
  return text.replace(/--\s*\d+\s*of\s*\d+\s*--/g, '');
}

function isTextless(text: string) {
  return stripPageMarkers(text).replace(/\s+/g, '').length < 20;
}

async function ocrText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const screenshot = await parser.getScreenshot({ scale: 2 });
    const pageTexts: string[] = [];
    for (const renderedPage of screenshot.pages) {
      const { data } = await Tesseract.recognize(Buffer.from(renderedPage.data), 'ben');
      pageTexts.push(data.text);
    }
    return pageTexts.join('\n');
  } finally {
    await parser.destroy();
  }
}

// Round-robin split so n PDFs (100, 200, or any n) spread evenly across up to WORKER_COUNT tests/workers.
function chunk<T>(items: T[], count: number): T[][] {
  const chunks: T[][] = Array.from({ length: count }, () => []);
  items.forEach((item, i) => chunks[i % count].push(item));
  return chunks;
}

// Test count must be static at collection time — Playwright lists every test in every
// project before any project runs, so reading FILES_FOLDER here (rather than inside the
// test body below) would freeze the chunk count at whatever existed before pdf-download
// and keyword-setup ran, usually zero on a fresh checkout.
for (let chunkIndex = 0; chunkIndex < WORKER_COUNT; chunkIndex++) {
  test(`verify and sort PDF chunk ${chunkIndex + 1}/${WORKER_COUNT}`, async () => {
    expect(fs.existsSync(FILES_FOLDER), `${FILES_FOLDER} does not exist — run pdf-download.spec.ts first`).toBeTruthy();

    const allFiles = fs.readdirSync(FILES_FOLDER).filter((f) => f.toLowerCase().endsWith('.pdf'));
    const fileChunk = chunk(allFiles, WORKER_COUNT)[chunkIndex];

    test.skip(fileChunk.length === 0, 'no PDFs assigned to this chunk');

    const matches: Record<string, string[]> = {};
    const failed: string[] = [];

    for (const file of fileChunk) {
      const sourcePath = path.join(FILES_FOLDER, file);

      try {
        const buffer = fs.readFileSync(sourcePath);

        await assertPdfIsReadable(buffer, file);

        const parser = new PDFParse({ data: buffer });
        const directText = (await parser.getText()).text;
        await parser.destroy();

        const text = isTextless(directText) ? await ocrText(buffer) : directText;
        const matchedLabels = KEYWORDS.filter(({ key }) => text.includes(key)).map(({ label }) => label);

        matchedLabels.forEach((label) => {
          (matches[label] ??= []).push(file);
        });
        if (matchedLabels.length > 0) console.log(`  ✓ ${file} -> [${matchedLabels.join(', ')}]`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failed.push(file);
        console.log(`  ✗ ${file} failed to read (${message})`);
      }

      reportProgress(allFiles.length);
    }

    const report = { chunk: chunkIndex + 1, matches, failed };
    const reportPath = path.join(DOWNLOAD_ROOT, `keyword-matches.chunk-${chunkIndex + 1}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    await test.info().attach(`keyword-matches.chunk-${chunkIndex + 1}.json`, { path: reportPath, contentType: 'application/json' });

    console.log(`[chunk ${chunkIndex + 1}/${WORKER_COUNT}] processed ${fileChunk.length} files`);
    if (failed.length > 0) console.log(`  failed: ${failed.length}`);
  });
}
