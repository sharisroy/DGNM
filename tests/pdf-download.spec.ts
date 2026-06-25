import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { assertPdfIsReadable } from './utils/pdf';
import { PAGE_START, PAGE_END, PAGE_SIZE } from './utils/config';

const BASE_URL = 'https://dgnm.gov.bd/pages/go-ultimates';
const DOWNLOAD_ROOT = path.join(__dirname, '..', 'downloads');
const FILES_FOLDER = path.join(DOWNLOAD_ROOT, 'files');

function listingUrl(pageNumber: number) {
  return `${BASE_URL}?page=${pageNumber}&page_size=${PAGE_SIZE}`;
}

test(`download and verify PDFs from page ${PAGE_START} to ${PAGE_END}`, async ({ page }) => {
  fs.rmSync(FILES_FOLDER, { recursive: true, force: true });
  fs.mkdirSync(FILES_FOLDER, { recursive: true });

  for (let pageNumber = PAGE_START; pageNumber <= PAGE_END; pageNumber++) {
    await page.goto(listingUrl(pageNumber), { waitUntil: 'networkidle' });
    await page.waitForTimeout(10000);

    const pdfHrefs = await page
      .locator('a[href]')
      .evaluateAll((anchors) =>
        Array.from(new Set(anchors.map((a) => (a as HTMLAnchorElement).href).filter((href) => href.toLowerCase().endsWith('.pdf'))))
      );

    expect(pdfHrefs.length, `expected at least one PDF link on page ${pageNumber}`).toBeGreaterThan(0);

    for (const [index, href] of pdfHrefs.entries()) {
      const response = await page.request.get(href);
      expect(response.ok(), `download failed for ${href}`).toBeTruthy();

      const buffer = await response.body();
      expect(buffer.length).toBeGreaterThan(0);

      const fileName = `page-${pageNumber}-${String(index + 1).padStart(2, '0')}-${path.basename(new URL(href).pathname)}`;
      const filePath = path.join(FILES_FOLDER, fileName);
      fs.writeFileSync(filePath, buffer);

      await assertPdfIsReadable(buffer, fileName);
    }
  }
});
