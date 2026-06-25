import path from 'path';

export const DOWNLOAD_ROOT = path.join(__dirname, '..', '..', 'downloads');
export const FILES_FOLDER = path.join(DOWNLOAD_ROOT, 'files');
export const MATCH_COUNT_FOLDER_REGEX = /^\d+ match$/;
export const CHUNK_REPORT_REGEX = /^keyword-matches\.chunk-\d+\.json$/;

export const KEYWORDS = [
  // { folder: 'shewly', key: 'শিউল' },
  // { folder: 'shewly roy', key: 'শিউল রায়' },
  // { folder: 'six', key: 'ছয়' },
  // { folder: 'domar', key: 'ডোমার' },
  // { folder: 'nilphamar', key: 'নীলফামারী' },
  // { folder: 'mother', key: 'মাতৃত্ব' },
  // { folder: '180', key: '১৮০' },
  // { folder: '01-03', key: '০১-০৩' },
  { folder: '01-03-2025', key: '০১-০৩-২০২৫' },
  { folder: '01_03_2025', key: '০১/০৩/২০২৫' },
  { folder: 'helth complex', key: 'উপজেলা স্বাস্থ্য কমপ্লেক্স, ডোমার' },
];
