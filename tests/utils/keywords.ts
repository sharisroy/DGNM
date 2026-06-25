import path from 'path';

const ROOT = path.join(__dirname, '..', '..');
export const DOWNLOAD_ROOT = path.join(ROOT, 'downloads');
export const FILES_FOLDER = path.join(ROOT, 'files');
export const PROGRESS_FILE = path.join(DOWNLOAD_ROOT, '.progress.count');
export const CHUNK_REPORT_REGEX = /^keyword-matches\.chunk-\d+\.json$/;
export const REPORT_FILE = path.join(DOWNLOAD_ROOT, 'keyword-matches.json');

export const KEYWORDS = [
  { label: 'shewly', key: 'শিউল' },
  // { label: 'shewly roy', key: 'শিউল রায়' },
  // { label: 'six', key: 'ছয়' },
  { label: 'domar', key: 'ডোমার' },
  // { label: 'nilphamar', key: 'নীলফামারী' },
  // { label: 'mother', key: 'মাতৃত্ব' },
  // { label: '180', key: '১৮০' },
  // { label: '01-03', key: '০১-০৩' },
  { label: '01-03-2025', key: '০১-০৩-২০২৫' },
  { label: '01_03_2025', key: '০১/০৩/২০২৫' },
  { label: 'helth complex', key: 'উপজেলা স্বাস্থ্য কমপ্লেক্স, ডোমার' },
];
