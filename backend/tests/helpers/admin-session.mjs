import { randomBytes, createHash, createHmac } from 'node:crypto';

// Isolated session rows shared by each test's fake Data API, never a production bypass.
export const sessions = new Map();
export function fixtureSession({ adminId, email }, expiresAt = Date.now() + 16 * 60 * 60 * 1000) {
  const token = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(token).digest('hex');
  sessions.set(hash, { token_hash: hash, admin_id: adminId, email, name: email,
    expires_at: new Date(expiresAt).toISOString() });
  return { Cookie: `${process.env.NODE_ENV === 'production' || process.env.VERCEL === '1' ? '__Host-mk_admin' : 'mk_admin'}=${token}`,
    'X-CSRF-Token': createHmac('sha256', token).update('admin-csrf').digest('hex') };
}

export async function serveSessionTable(req, res, url) {
  if (url.pathname !== '/rest/v1/admin_sessions') return false;
  res.setHeader('Content-Type', 'application/json');
  const hash = url.searchParams.get('token_hash')?.slice(3);
  let rows = [...sessions.values()].filter(row => !hash || row.token_hash === hash);
  if (req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const row = JSON.parse(raw);
    sessions.set(row.token_hash, row);
    rows = [row];
  } else if (req.method === 'DELETE') {
    const before = url.searchParams.get('expires_at')?.slice(3);
    rows = rows.filter(row => !before || row.expires_at < before);
    for (const row of rows) sessions.delete(row.token_hash);
  }
  res.end(JSON.stringify(req.headers.accept?.includes('application/vnd.pgrst.object+json') ? rows[0] ?? null : rows));
  return true;
}
