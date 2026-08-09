import 'dotenv/config';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  assertAdminBootstrapIsLocal,
  readAdminBootstrapCredentials,
} from '../utils/adminBootstrap.js';
import { logUnexpectedError } from '../utils/safeErrorMetadata.js';

async function main() {
  assertAdminBootstrapIsLocal();
  const { email, password } = readAdminBootstrapCredentials();

  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE,
  });

  try {
    console.log(`⏳ Testar databasanslutning...`);

    // Kolla om kontot redan finns
    const [existing] = await db.query('SELECT id FROM admin_users WHERE email = ?', [email]) as [any[], any];
    const hash = await bcrypt.hash(password, 10);

    if (existing && existing.length > 0) {
      // Uppdatera lösenordet ifall de skrev fel tidigare
      await db.query('UPDATE admin_users SET password_hash = ? WHERE email = ?', [hash, email]);
      console.log('✅ Admin-konto fanns redan – lösenordet har blivit återställt/uppdaterat!');
    } else {
      // Skapa nytt konto
      const id = crypto.randomUUID();
      await db.query(
        'INSERT INTO admin_users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)',
        [id, email, hash, 'Dev Admin']
      );
      console.log('✅ Nytt admin-konto är skapat och redo att användas lokalt!');
    }

    console.log('Admin-kontot är klart. Inloggningsuppgifter skrevs inte till loggen.');

  } catch (error) {
    logUnexpectedError('create-admin failed', error);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main();
