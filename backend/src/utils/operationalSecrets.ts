const REQUIRED_SECRET_BYTES = 32;

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL_ENV);
}

function validSecret(value: string | undefined): value is string {
  return Boolean(value && Buffer.byteLength(value, 'utf8') >= REQUIRED_SECRET_BYTES);
}

export function assertOperationalSecretsConfiguration(): void {
  if (!isProduction()) return;

  const jwt = process.env.JWT_SECRET?.trim();
  const deletePassword = process.env.DELETE_PASSWORD?.trim();
  const statsPassword = process.env.STATS_PASSWORD?.trim();
  if (!validSecret(deletePassword) || !validSecret(statsPassword)) {
    throw new Error(
      '[SECURITY FATAL] DELETE_PASSWORD and STATS_PASSWORD must each be at least 32 bytes in production'
    );
  }
  if (deletePassword === statsPassword || deletePassword === jwt || statsPassword === jwt) {
    throw new Error('[SECURITY FATAL] Admin operational secrets must be unique');
  }
}
