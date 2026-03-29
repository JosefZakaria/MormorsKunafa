import 'dotenv/config';
import { db } from '../db/connection.js';

async function run() {
  console.log('Fixing product names and variants...');

  // Update existing ones to more "real" names
  const updates = [
    { id: 'fc469599-82e8-4ea3-aa18-0436bc2a2afd', name: 'Ashta Baklawa 149 kr - 500 gram' },
    { id: '1ae3fd7a-0042-4220-b330-b27b3147a0a6', name: 'Baklawa Pistage 89 kr - 500 gram' },
    { id: '054b4adf-4da3-42c0-aa9b-b939023aafad', name: 'Baklawa Valnöt 69 kr - 500 gram' },
    { id: '856b591e-08b3-40ec-b505-cb3b143293bb', name: 'Bröd (Kaek) 15 kr' },
    { id: '77048580-fd68-454d-b34b-395b351a96d4', name: 'Finmald Kunafa 149 kr - 500 gram' },
    { id: '37b8b656-2604-4ca6-9745-e0d6f52338c1', name: 'Krispig Kunafa 149 kr - 500 gram' },
    { id: '6312f48a-b156-431b-9f6d-103cc30bc9f8', name: 'Mamoul Pistage 179 kr - 500 gram' },
    { id: 'c005c8af-3f2e-401c-923f-7dac0f682cda', name: 'Mormorsbox - Baklawa Mix 299 kr' },
    { id: '9e6d210b-8637-4deb-889c-0726060288aa', name: 'Pistagemix 499 kr' },
  ];

  for (const item of updates) {
    await db.query('UPDATE products SET name = ? WHERE id = ?', [item.name, item.id]);
  }

  // Add missing common variants to make it look "real"
  const variants = [
    { name: 'Ashta Baklawa 149 kr - 250 gram', price_ore: 14900, slug: 'ashta-baklawa-250g' },
    { name: 'Baklawa Pistage 89 kr - 250 gram', price_ore: 8900, slug: 'baklawa-pistage-250g' },
    { name: 'Baklawa Valnöt 69 kr - 250 gram', price_ore: 6900, slug: 'baklawa-valnot-250g' },
    { name: 'Finmald Kunafa 149 kr - 250 gram', price_ore: 14900, slug: 'finmald-kunafa-250g' },
    { name: 'Krispig Kunafa 149 kr - 250 gram', price_ore: 14900, slug: 'krispig-kunafa-250g' },
    { name: 'Testa-Kunafa', price_ore: 15000, slug: 'testa-kunafa' }
  ];

  for (const v of variants) {
    const [existing] = await db.query('SELECT id FROM products WHERE name = ?', [v.name]) as any[];
    if (existing.length === 0) {
      const id = crypto.randomUUID();
      await db.query(
        'INSERT INTO products (id, name, slug, price_ore, stock_status) VALUES (?, ?, ?, ?, ?)',
        [id, v.name, v.slug, v.price_ore, 'instock']
      );
      console.log(`Added variant: ${v.name}`);
    }
  }

  console.log('Database updated successfully!');
  process.exit(0);
}

run();
