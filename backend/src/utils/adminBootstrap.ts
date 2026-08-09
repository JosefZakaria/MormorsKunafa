const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function assertAdminBootstrapIsLocal(
  nodeEnv = process.env.NODE_ENV,
  vercelEnv = process.env.VERCEL_ENV
): void {
  if (nodeEnv === 'production' || Boolean(vercelEnv)) {
    throw new Error('Admin bootstrap is disabled in deployed environments');
  }
}

export function readAdminBootstrapCredentials(environment = process.env): {
  email: string;
  password: string;
} {
  const email = environment.DEFAULT_ADMIN_EMAIL?.trim() ?? '';
  const password = environment.DEFAULT_ADMIN_PASSWORD ?? '';
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error('DEFAULT_ADMIN_EMAIL must be an explicit valid email address');
  }
  if (Buffer.byteLength(password, 'utf8') < 16) {
    throw new Error('DEFAULT_ADMIN_PASSWORD must be at least 16 bytes');
  }
  return { email, password };
}
