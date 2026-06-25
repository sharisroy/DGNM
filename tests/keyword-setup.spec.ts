import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { DOWNLOAD_ROOT, FILES_FOLDER, CHUNK_REPORT_REGEX, PROGRESS_FILE, REPORT_FILE } from './utils/keywords';

test('prepare keyword output folders', async () => {
  expect(fs.existsSync(FILES_FOLDER), `${FILES_FOLDER} does not exist — run pdf-download.spec.ts first`).toBeTruthy();

  fs.mkdirSync(DOWNLOAD_ROOT, { recursive: true });

  for (const name of fs.readdirSync(DOWNLOAD_ROOT)) {
    if (CHUNK_REPORT_REGEX.test(name)) {
      fs.rmSync(path.join(DOWNLOAD_ROOT, name), { force: true });
    }
  }

  fs.rmSync(REPORT_FILE, { force: true });
  fs.rmSync(PROGRESS_FILE, { force: true });
});
