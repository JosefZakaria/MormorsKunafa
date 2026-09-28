import bcrypt from 'bcryptjs';

// Public, fixed bcrypt hash used only to make an unknown-account login perform
// the same expensive password check as a known account. It is not a credential.
const DUMMY_PASSWORD_HASH = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';

export async function verifyAdminPassword(
  password: string,
  storedHash: string | undefined
): Promise<boolean> {
  const hash = storedHash?.trim() || DUMMY_PASSWORD_HASH;
  try {
    const matches = await bcrypt.compare(password, hash);
    return Boolean(storedHash) && matches;
  } catch {
    return false;
  }
}
