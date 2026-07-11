import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { assertPdfIsReadable } from './utils/pdf';
import { PAGE_START, PAGE_END, PAGE_SIZE } from './utils/config';
import { FILES_FOLDER } from './utils/keywords';

const BASE_URL = 'https://dgnm.gov.bd/pages/go-ultimates';
const ORDER_FILTER = '6922d2e881fc96cef9e9b0d2';
const PUBLISH_DATE_PATTERN = /\d{2}-\d{2}-\d{4}/;

function listingUrl(pageNumber: number) {
  const filters = encodeURIComponent(JSON.stringify({ order: ORDER_FILTER }));
  return `${BASE_URL}?filters=${filters}&page=${pageNumber}&page_size=${PAGE_SIZE}`;
}


// const BASE_URL = 'https://dgnm.gov.bd/pages/go-ultimates';
// const PUBLISH_DATE_PATTERN = /\d{2}-\d{2}-\d{4}/;

// function listingUrl(pageNumber: number) {
//   return `${BASE_URL}?page=${pageNumber}&page_size=${PAGE_SIZE}`;
// }

test(`download and verify PDFs from page ${PAGE_START} to ${PAGE_END}`, async ({ page }) => {
  fs.rmSync(FILES_FOLDER, { recursive: true, force: true });
  fs.mkdirSync(FILES_FOLDER, { recursive: true });

  // The site renders Publish Date with Bengali numerals (e.g. ০৮-০৭-২০২৬) until the
  // language is switched to English, which PUBLISH_DATE_PATTERN can't match — every
  // row would otherwise fall back to 'unknown-date'. The toggle sets a `lang` cookie
  // and reloads, and that cookie sticks for the rest of this browser context.
  await page.goto(listingUrl(PAGE_START), { waitUntil: 'networkidle' });
  const langToggle = page.locator('.btn-lang-change');
  if ((await langToggle.getAttribute('data-type')) === 'bn') {
    await langToggle.click();
    await page.waitForLoadState('networkidle');
  }

  for (let pageNumber = PAGE_START; pageNumber <= PAGE_END; pageNumber++) {
    await page.goto(listingUrl(pageNumber), { waitUntil: 'networkidle' });
    await page.waitForTimeout(10000);

    // Each listing row (SL/Title/Issue No/Files/Publish Date/Action) can hold more
    // than one PDF link, so pair every href with its own row's Publish Date cell
    // rather than pulling all page anchors into one flat, dateless list.
    const rows = await page.locator('tr').evaluateAll((trs) =>
      trs
        .map((tr) => ({
          rowText: tr.textContent ?? '',
          hrefs: Array.from(tr.querySelectorAll('a[href]'))
            .map((a) => (a as HTMLAnchorElement).href)
            .filter((href) => href.toLowerCase().endsWith('.pdf')),
        }))
        .filter((row) => row.hrefs.length > 0)
    );

    const pdfEntries = rows.flatMap((row) => {
      const dateMatch = row.rowText.match(PUBLISH_DATE_PATTERN);
      const publishDate = dateMatch ? dateMatch[0] : 'unknown-date';
      return row.hrefs.map((href) => ({ href, publishDate }));
    });

    expect(pdfEntries.length, `expected at least one PDF link on page ${pageNumber}`).toBeGreaterThan(0);

    for (const [index, { href, publishDate }] of pdfEntries.entries()) {
      const response = await page.request.get(href);
      expect(response.ok(), `download failed for ${href}`).toBeTruthy();

      const buffer = await response.body();
      expect(buffer.length).toBeGreaterThan(0);

      const fileName = `${publishDate}_page-${pageNumber}-${String(index + 1).padStart(2, '0')}-${path.basename(new URL(href).pathname)}`;
      const filePath = path.join(FILES_FOLDER, fileName);
      fs.writeFileSync(filePath, buffer);

      await assertPdfIsReadable(buffer, fileName);
    }
  }
});
