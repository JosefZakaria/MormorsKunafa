const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function parseMigrationAdminPasswords(value: unknown): Map<string, string> {
  const raw = String(value ?? '').trim();
  if (!raw) return new Map();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('WP_MIGRATION_ADMIN_PASSWORDS_JSON must be a JSON object');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('WP_MIGRATION_ADMIN_PASSWORDS_JSON must map admin emails to passwords');
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length > 100) {
    throw new Error('WP_MIGRATION_ADMIN_PASSWORDS_JSON contains too many admins');
  }

  const passwords = new Map<string, string>();
  const uniquePasswords = new Set<string>();
  for (const [rawEmail, rawPassword] of entries) {
    const email = rawEmail.trim().toLowerCase();
    const password = typeof rawPassword === 'string' ? rawPassword : '';
    if (!EMAIL_PATTERN.test(email)) {
      throw new Error('WP_MIGRATION_ADMIN_PASSWORDS_JSON contains an invalid email');
    }
    if (Buffer.byteLength(password, 'utf8') < 16 || Buffer.byteLength(password, 'utf8') > 256) {
      throw new Error('Every migration admin password must be between 16 and 256 bytes');
    }
    if (uniquePasswords.has(password)) {
      throw new Error('Every migrated admin must use a unique temporary password');
    }
    passwords.set(email, password);
    uniquePasswords.add(password);
  }

  return passwords;
}
