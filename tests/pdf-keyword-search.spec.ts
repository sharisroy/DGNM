import { test, expect } from '@playwright/test';
import { PDFParse } from 'pdf-parse';
import Tesseract from 'tesseract.js';
import fs from 'fs';
import path from 'path';
import { assertPdfIsReadable } from './utils/pdf';
import { DOWNLOAD_ROOT, FILES_FOLDER, KEYWORDS, FAILED_FOLDER, PROGRESS_FILE } from './utils/keywords';
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

    const results = KEYWORDS.map(({ folder, key }) => ({
      key,
      folder,
      matched: [] as { file: string; method: 'text' | 'ocr' }[],
      notMatched: [] as { file: string; method: 'text' | 'ocr' }[],
    }));

    const multiMatches: { file: string; method: 'text' | 'ocr'; count: number; keys: string[] }[] = [];
    const failed: { file: string; error: string }[] = [];

    for (const file of fileChunk) {
      const sourcePath = path.join(FILES_FOLDER, file);

      try {
        const buffer = fs.readFileSync(sourcePath);

        await assertPdfIsReadable(buffer, file);

        const parser = new PDFParse({ data: buffer });
        const directText = (await parser.getText()).text;
        await parser.destroy();

        let method: 'text' | 'ocr' = 'text';
        let text = directText;
        if (isTextless(directText)) {
          method = 'ocr';
          text = await ocrText(buffer);
        }

        const matchedKeys = new Set<string>();

        for (const result of results) {
          const entry = { file, method };
          if (text.includes(result.key)) {
            result.matched.push(entry);
            matchedKeys.add(result.key);
            fs.copyFileSync(sourcePath, path.join(DOWNLOAD_ROOT, result.folder, file));
          } else {
            result.notMatched.push(entry);
          }
        }

        if (matchedKeys.size >= 2) {
          const countFolderPath = path.join(DOWNLOAD_ROOT, `${matchedKeys.size} match`);
          fs.mkdirSync(countFolderPath, { recursive: true });
          fs.copyFileSync(sourcePath, path.join(countFolderPath, file));
          multiMatches.push({ file, method, count: matchedKeys.size, keys: [...matchedKeys] });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        fs.copyFileSync(sourcePath, path.join(FAILED_FOLDER, file));
        failed.push({ file, error: message });
        console.log(`  ✗ ${file} failed to read (${message}) -> downloads/failed/`);
      }

      reportProgress(allFiles.length);
    }

    const report = {
      chunk: chunkIndex + 1,
      byKeyword: results.map(({ key, folder, matched, notMatched }) => ({
        keyword: key,
        folder,
        matchedCount: matched.length,
        notMatchedCount: notMatched.length,
        matched,
        notMatched,
      })),
      multiMatches,
      failed,
    };
    const reportPath = path.join(DOWNLOAD_ROOT, `keyword-matches.chunk-${chunkIndex + 1}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    await test.info().attach(`keyword-matches.chunk-${chunkIndex + 1}.json`, { path: reportPath, contentType: 'application/json' });

    console.log(`[chunk ${chunkIndex + 1}/${WORKER_COUNT}] processed ${fileChunk.length} files`);
    for (const { key, folder, matched } of results) {
      if (matched.length > 0) {
        console.log(`  "${key}" -> downloads/${folder}/: ${matched.length}`);
        matched.forEach(({ file, method }) => console.log(`    ✓ ${file} (${method})`));
      }
    }
    multiMatches.forEach(({ file, count, keys }) => console.log(`  ${count} match -> ${file} [${keys.join(', ')}]`));
    if (failed.length > 0) {
      console.log(`  failed -> downloads/failed/: ${failed.length}`);
      failed.forEach(({ file, error }) => console.log(`    ✗ ${file} (${error})`));
    }
  });
}
