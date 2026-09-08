import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import https from 'node:https';
import { repositoryRoot } from './local-test-database.mjs';

export const TEST_ORIGIN = 'http://127.0.0.1:4179';
export const HOJA = '2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f601';
export const MOLLEVANGEN = '2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f602';
export const PRODUCT = '1ae3fd7a-0042-4220-b330-b27b3147a0a6';
export const TEST_PASSWORD = 'Synthetic-local-password-42';
const identifier = s => { assert.match(s, /^[a-z_][a-z0-9_]*$/); return `"${s}"`; };
export const literal = value => value == null ? 'NULL' : typeof value === 'number' ? String(value)
  : typeof value === 'boolean' ? String(value)
  : "'" + (typeof value === 'object' ? JSON.stringify(value) : String(value)).replaceAll("'", "''") + "'";

export async function initializeSyntheticDatabase({ file, sql }) {
  await file(path.join(repositoryRoot, 'backend/test/fixtures/base-schema.sql'));
  const dir = path.join(repositoryRoot, 'backend/src/db/migrations');
  for (const name of JSON.parse(await readFile(path.join(dir, 'migration-order.json'), 'utf8'))) await file(path.join(dir, name));
  const { default: bcrypt } = await import('bcryptjs');
  const hash = await bcrypt.hash(TEST_PASSWORD, 10);
  await sql(`INSERT INTO products(id,name,slug,price_ore,variant_prices,stock_status,sort_order)
    VALUES ('${PRODUCT}','Syntetisk baklawa','baklawa-pistage',8900,'{"250 gram":9900,"500 gram":18000}', 'instock',1);
    INSERT INTO product_location_stock SELECT '${PRODUCT}', id, true FROM locations;
    INSERT INTO admin_users(id,email,password_hash,role,location_id) VALUES
    ('owner-test','owner@example.test',${literal(hash)},'owner',NULL),
    ('hoja-test','hoja@example.test',${literal(hash)},'location','${HOJA}'),
    ('mollevangen-test','mollevangen@example.test',${literal(hash)},'location','${MOLLEVANGEN}');`);
}

// Deliberately small test adapter. The actual SQL/RPC runs in PostgreSQL under
// service_role; this does not claim to emulate Supabase Storage or PostgREST fully.
export function syntheticPostgrest(sql) {
  return async (input, init = {}) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, 'http://supabase.invalid', 'External HTTP is forbidden in synthetic tests');
    const parts = url.pathname.split('/').filter(Boolean);
    assert.equal(parts[0], 'rest'); assert.equal(parts[1], 'v1');
    let query;
    let scalar = false;
    try {
      if (parts[2] === 'rpc') {
        const name = parts[3];
        const args = await request.json();
        const setReturning = await sql(`SELECT proretset::text FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=${literal(name)}`);
        const call = `${identifier(name)}(${Object.entries(args).map(([key,value]) => `${identifier(key)} => ${literal(value)}${typeof value === 'object' && value !== null ? '::jsonb' : ''}`).join(',')})`;
        scalar = setReturning === 'false';
        query = scalar ? `SELECT to_jsonb(${call})::text` : `SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]')::text FROM ${call} r`;
      } else {
        const table = identifier(parts[2]);
        const conditions = [];
        for (const [key, filter] of url.searchParams) {
          if (['select','order','limit','offset','on_conflict'].includes(key)) continue;
          const dot = filter.indexOf('.');
          const op = filter.slice(0,dot), value = filter.slice(dot+1);
          const column = identifier(key);
          if (op === 'in') conditions.push(`${column} IN (${value.slice(1,-1).split(',').map(s=>literal(s.replace(/^"|"$/g,''))).join(',')})`);
          else if (op === 'is') { assert(['null','true','false'].includes(value)); conditions.push(`${column} IS ${value}`); }
          else if (op === 'not' && value.startsWith('is.')) {
            const operand = value.slice(3); assert(['null','true','false'].includes(operand));
            conditions.push(`${column} IS NOT ${operand}`);
          }
          else {
            const operator = {eq:'=',neq:'<>',gt:'>',gte:'>=',lt:'<',lte:'<='}[op];
            assert(operator, `Unsupported synthetic filter ${op}`);
            conditions.push(`${column} ${operator} ${literal(value)}`);
          }
        }
        const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
        const select = url.searchParams.get('select') ?? '*';
        const columns = select === '*' ? '*' : select.split(',').map(identifier).join(',');
        if (request.method === 'GET' || request.method === 'HEAD') {
          const sort = url.searchParams.get('order');
          const order = sort ? ' ORDER BY '+sort.split(',').map(part => {
            const [col,dir] = part.split('.'); assert(['asc','desc'].includes(dir)); return `${identifier(col)} ${dir}`;
          }).join(',') : '';
          const limit = Number(url.searchParams.get('limit') ?? 1000);
          const offset = Number(url.searchParams.get('offset') ?? 0);
          assert(Number.isInteger(limit) && limit >= 0 && limit <= 10000);
          assert(Number.isInteger(offset) && offset >= 0);
          query = `SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]')::text FROM (SELECT ${columns} FROM ${table}${where}${order} LIMIT ${limit} OFFSET ${offset}) r`;
        } else {
          let mutation;
          if (request.method === 'DELETE') mutation = `DELETE FROM ${table}${where}`;
          else {
            const body = await request.json();
            assert(!Array.isArray(body), 'Batch writes need an explicit test adapter implementation');
            if (request.method === 'PATCH') mutation = `UPDATE ${table} SET ${Object.entries(body).map(([k,v])=>`${identifier(k)}=${literal(v)}`).join(',')}${where}`;
            else { assert.equal(request.method,'POST'); mutation = `INSERT INTO ${table} (${Object.keys(body).map(identifier).join(',')}) VALUES (${Object.values(body).map(literal).join(',')})`; }
          }
          query = `WITH r AS (${mutation} RETURNING ${columns}) SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]')::text FROM r`;
        }
      }
      const data = JSON.parse((await sql('SET ROLE service_role; ' + query)) || 'null');
      const single = request.headers.get('accept')?.includes('vnd.pgrst.object+json');
      const result = !scalar && single ? (data[0] ?? null) : data;
      return Response.json(result, { headers: { 'content-range': `0-${Math.max(0,(data?.length ?? 1)-1)}/${data?.length ?? 1}` } });
    } catch (error) {
      console.error('[synthetic adapter]', error.message);
      return Response.json({code:'TEST_ADAPTER_ERROR',message:'Synthetic database request failed'}, {status:400});
    }
  };
}

export async function createSyntheticApp(db) {
  // Drop inherited integration credentials before importing application modules.
  const keep = new Set(['PATH','SYSTEMROOT','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','PATHEXT']);
  for (const key of Object.keys(process.env)) if (!keep.has(key.toUpperCase())) delete process.env[key];
  const emptyEnv = path.join(repositoryRoot, '.cache/security-test/empty.env');
  await mkdir(path.dirname(emptyEnv), { recursive:true }); await writeFile(emptyEnv, '');
  Object.assign(process.env, { NODE_ENV:'test', DOTENV_CONFIG_PATH:emptyEnv, PUBLIC_WEB_APP_URL:TEST_ORIGIN,
    SUPABASE_URL:'http://supabase.invalid', SUPABASE_SERVICE_ROLE_KEY:'synthetic-test-role',
    STRIPE_SECRET_KEY:'sk_test_'+'a'.repeat(32), STRIPE_WEBHOOK_SECRET:'whsec_'+'b'.repeat(32),
    JWT_SECRET:randomBytes(32).toString('hex'), ORDER_STATUS_TOKEN_SECRET:randomBytes(32).toString('hex') });
  globalThis.fetch = syntheticPostgrest(db.sql);
  https.request = () => { throw new Error('External HTTPS is forbidden in synthetic tests'); };
  const { default: bcrypt } = await import('bcryptjs');
  process.env.REFUND_PASSWORD_HASH = await bcrypt.hash(TEST_PASSWORD,10);
  const { getStripe } = await import('../../backend/dist/services/stripeClient.js');
  const stripe = getStripe();
  const sessions = new Map(), attempts = new Map();
  stripe.checkout.sessions.create = async (params, options) => {
    if (attempts.has(options.idempotencyKey)) return sessions.get(attempts.get(options.idempotencyKey));
    const id = `cs_test_${randomBytes(16).toString('hex')}`;
    const session = { id, mode:'payment', currency:'sek', status:'open', payment_status:'unpaid', payment_method_types:['card'],
      metadata:params.metadata, client_reference_id:params.client_reference_id,
      amount_total:params.line_items.reduce((n,line)=>n+line.quantity*line.price_data.unit_amount,0),
      url:`https://checkout.stripe.com/c/pay/${id}`, success_url:params.success_url,
      payment_intent:'pi_test_'+randomBytes(12).toString('hex'), livemode:false };
    attempts.set(options.idempotencyKey,id); sessions.set(id,session); return session;
  };
  stripe.checkout.sessions.retrieve = async id => { assert(sessions.has(id),'Unknown synthetic session'); return sessions.get(id); };
  const refunds = new Map(), refundAttempts = new Map();
  const faults = { refundTimeout:false, hideRefunds:false, refundCreateCalls:0 };
  stripe.refunds.create = async (params,options) => {
    faults.refundCreateCalls++;
    if (refundAttempts.has(options.idempotencyKey)) return refunds.get(refundAttempts.get(options.idempotencyKey));
    const id='re_test_'+randomBytes(12).toString('hex');
    const refund={id,...params,currency:'sek',status:'succeeded'};
    refunds.set(id,refund);refundAttempts.set(options.idempotencyKey,id);
    if (faults.refundTimeout) { faults.refundTimeout=false; throw new Error('Simulated response lost after provider acceptance'); }
    return refund;
  };
  stripe.refunds.retrieve = async id => { assert(refunds.has(id)); return refunds.get(id); };
  stripe.refunds.list = async params => ({data:faults.hideRefunds ? [] : [...refunds.values()].filter(r=>r.payment_intent===params.payment_intent),has_more:false});
  const { default: app } = await import('../../backend/dist/index.js');
  return { app, sessions, stripe, refunds, faults, expireRefundKeys:()=>refundAttempts.clear() };
}
