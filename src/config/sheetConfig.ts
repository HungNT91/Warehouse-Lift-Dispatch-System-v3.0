export const GOOGLE_SHEET_API_URL = 
  import.meta.env.VITE_GOOGLE_SHEET_API_URL || 
  'https://script.google.com/macros/s/AKfycbxjDP4OIDicAAE8SYoL7FWdBuFh4cJYwr-Uop4etDuybETNT2epgZNApzRzsRkzDqlJ/exec';

export const isGoogleSheetConfigured = (): boolean => {
  return Boolean(GOOGLE_SHEET_API_URL && GOOGLE_SHEET_API_URL.startsWith('https://script.google.com'));
};
