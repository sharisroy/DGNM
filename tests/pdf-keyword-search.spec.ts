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

// Leptonica/Tesseract report some failures (e.g. "Image too small to scale!!",
// "Line cannot be recognized!!") by printing straight to stdout/stderr instead of
// throwing or rejecting — the page still "succeeds" with whatever partial text it
// managed to recognize. Watching the streams while OCR runs is the only way to see these.
const OCR_WARNING_PATTERNS = [/image too small to scale/i, /cannot be recognized/i];

function watchForOcrWarnings<T>(run: () => Promise<T>): Promise<{ result: T; hadOcrWarning: boolean }> {
  let hadOcrWarning = false;
  const check = (chunk: unknown) => {
    if (OCR_WARNING_PATTERNS.some((pattern) => pattern.test(String(chunk)))) hadOcrWarning = true;
  };
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: unknown, ...args: unknown[]) => {
    check(chunk);
    return (originalStdoutWrite as Function)(chunk, ...args);
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown, ...args: unknown[]) => {
    check(chunk);
    return (originalStderrWrite as Function)(chunk, ...args);
  }) as typeof process.stderr.write;

  return run().finally(() => {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }).then((result) => ({ result, hadOcrWarning }));
}

async function ocrText(buffer: Buffer): Promise<{ text: string; hadOcrWarning: boolean }> {
  const parser = new PDFParse({ data: buffer });
  try {
    return await watchForOcrWarnings(async () => {
      const screenshot = await parser.getScreenshot({ scale: 2 });
      const pageTexts: string[] = [];
      for (const renderedPage of screenshot.pages) {
        const { data } = await Tesseract.recognize(Buffer.from(renderedPage.data), 'ben');
        pageTexts.push(data.text);
      }
      return pageTexts.join('\n');
    }).then(({ result, hadOcrWarning }) => ({ text: result, hadOcrWarning }));
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

        const usedOcr = isTextless(directText);
        let text = directText;
        let ocrFailed = false;

        if (usedOcr) {
          const ocrResult = await ocrText(buffer);
          text = ocrResult.text;
          ocrFailed = ocrResult.hadOcrWarning || isTextless(text);
        }

        if (ocrFailed) {
          failed.push(file);
          console.log(`  ✗ ${file} failed to read (OCR could not recognize the page)`);
          reportProgress(allFiles.length);
          continue;
        }

        const matchedLabels = KEYWORDS.filter(({ key }) => text.includes(key)).map(({ label }) => label);

        matchedLabels.forEach((label) => {
          (matches[label] ??= []).push(file);

          const labelFolder = path.join(DOWNLOAD_ROOT, label);
          fs.mkdirSync(labelFolder, { recursive: true });
          fs.copyFileSync(sourcePath, path.join(labelFolder, file));
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
