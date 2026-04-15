const LANGUAGE_MAP: Record<string, string> = {
  en: 'English',
  ja: 'Japanese',
  es: 'Spanish',
  de: 'German',
  fr: 'French',
  zh: 'Chinese',
  pt: 'Portuguese',
  ko: 'Korean',
};

export function getLanguageName(code: string): string {
  return LANGUAGE_MAP[code] || 'English';
}
