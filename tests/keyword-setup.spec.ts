import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { DOWNLOAD_ROOT, KEYWORDS, MATCH_COUNT_FOLDER_REGEX, CHUNK_REPORT_REGEX, FAILED_FOLDER, PROGRESS_FILE, REPORT_FILE } from './utils/keywords';

test('prepare keyword output folders', async () => {
  expect(fs.existsSync(DOWNLOAD_ROOT), `${DOWNLOAD_ROOT} does not exist — run pdf-download.spec.ts first`).toBeTruthy();

  for (const name of fs.readdirSync(DOWNLOAD_ROOT)) {
    if (MATCH_COUNT_FOLDER_REGEX.test(name)) {
      fs.rmSync(path.join(DOWNLOAD_ROOT, name), { recursive: true, force: true });
    }
    if (CHUNK_REPORT_REGEX.test(name)) {
      fs.rmSync(path.join(DOWNLOAD_ROOT, name), { force: true });
    }
  }

  fs.rmSync(REPORT_FILE, { force: true });
  fs.rmSync(PROGRESS_FILE, { force: true });

  for (const { folder } of KEYWORDS) {
    const folderPath = path.join(DOWNLOAD_ROOT, folder);
    fs.rmSync(folderPath, { recursive: true, force: true });
    fs.mkdirSync(folderPath, { recursive: true });
  }

  fs.rmSync(FAILED_FOLDER, { recursive: true, force: true });
  fs.mkdirSync(FAILED_FOLDER, { recursive: true });
});
