import 'dotenv/config';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

async function main() {
  // SÄKERHET: Se till att scriptet inte oavsiktligt körs i produktion
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Förbjudet: Detta skript är avstängt i produktion för din säkerhet.');
    console.error('Hackare kan inte köra detta för att komma in i skarpa databasen.');
    process.exit(1);
  }

  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE,
  });

  try {
    const email = process.env.DEFAULT_ADMIN_EMAIL ?? 'admin@mormorskunafe.se';
    const password = process.env.DEFAULT_ADMIN_PASSWORD ?? 'admin123';
    
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
    
    console.log(`----------------------------------------`);
    console.log(` 📧 E-post:   ${email}`);
    console.log(` 🔑 Lösenord: ${password}`);
    console.log(`----------------------------------------`);
    console.log(`(Detta gäller endast den databas som körs på ${process.env.DB_HOST})`);

  } catch (error) {
    console.error('❌ Ett fel uppstod vid skapandet av admin:', error);
  } finally {
    await db.end();
  }
}

main();
