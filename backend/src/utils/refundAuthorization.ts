import bcrypt from 'bcryptjs';

// Public timing equalizer only; this hash is not a usable application secret.
const DUMMY_REFUND_HASH = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{53}$/;

export function isRefundPasswordConfigured(hash = process.env.REFUND_PASSWORD_HASH): boolean {
  const match = String(hash ?? '').trim().match(BCRYPT_HASH_PATTERN);
  if (!match) return false;
  const rounds = Number(match[1]);
  return Number.isInteger(rounds) && rounds >= 10 && rounds <= 15;
}

export async function verifyRefundPassword(
  password: string,
  configuredHash = process.env.REFUND_PASSWORD_HASH
): Promise<boolean> {
  const validConfiguration = isRefundPasswordConfigured(configuredHash);
  const hash = validConfiguration ? String(configuredHash).trim() : DUMMY_REFUND_HASH;
  try {
    const matches = await bcrypt.compare(password, hash);
    return validConfiguration && password.length <= 256 && matches;
  } catch {
    return false;
  }
}
