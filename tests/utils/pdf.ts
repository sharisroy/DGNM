import { expect } from '@playwright/test';
import { PDFParse } from 'pdf-parse';

export async function assertPdfIsReadable(buffer: Buffer, label: string) {
  const parser = new PDFParse({ data: buffer });
  try {
    const info = await parser.getInfo();
    expect(info.total, `${label} should have at least one page`).toBeGreaterThan(0);

    const text = await parser.getText();
    expect(text.text, `${label} should not be empty/corrupt`).toBeDefined();
  } finally {
    await parser.destroy();
  }
}
