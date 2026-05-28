export function sanitizeProductName(name: string): string {
  return name
    .replace(/[–—]/g, '-')
    .replace(/\s*\d+\s*kr\b/gi, '')
    .replace(/\s*-{2,}\s*/g, ' - ')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
