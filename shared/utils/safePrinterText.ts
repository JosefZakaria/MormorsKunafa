const ANSI_ESCAPE_SEQUENCE = /\u001b(?:\[[0-?]*[ -/]*[@-~]|[@-_])/gu;
const CONTROL_AND_BIDI = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu;

/**
 * Convert untrusted text to one bounded printable line before ESC/POS or ePOS
 * serialization. This is a second boundary check for legacy database rows.
 */
export function safePrinterText(value: unknown, maximumLength = 300): string {
  return String(value ?? '')
    .replace(ANSI_ESCAPE_SEQUENCE, '')
    .replace(CONTROL_AND_BIDI, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maximumLength);
}
