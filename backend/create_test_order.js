import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

(async () => {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('❌ Saknar miljövariabler för Supabase!');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const orderId = crypto.randomUUID();
  const itemId = crypto.randomUUID();
  const estimatedReady = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const orderNumber = `#${randomNum}`;

  console.log(`⏳ Skapar en ny testorder ${orderNumber} i Supabase...`);

  // 1. Skapa order
  const { error: orderError } = await supabase.from('orders').insert({
    id: orderId,
    order_number: orderNumber,
    status: 'ny',
    order_type: 'takeaway',
    payment_method: 'swish',
    payment_status: 'paid',
    total_ore: 15000,
    default_preparation_time_minutes: 30,
    estimated_ready_at: estimatedReady.toISOString(),
    customer_name: 'Test-Kund',
    customer_phone: '0701234567',
  });

  if (orderError) {
    console.error('❌ Fel vid skapande av order:', orderError);
    process.exit(1);
  }

  // 2. Skapa order items
  const { error: itemError } = await supabase.from('order_items').insert({
    id: itemId,
    order_id: orderId,
    product_name_snapshot: 'Testa-Kunafa (Larmtest)',
    quantity: 1,
    price_ore: 15000,
  });

  if (itemError) {
    console.error('❌ Fel vid skapande av orderrader:', itemError);
    // Försök städa undan ordern
    await supabase.from('orders').delete().eq('id', orderId);
    process.exit(1);
  }

  console.log('✅ Skapade en ny testbeställning med status [Ny] och [Betald] i Supabase: ', orderId);
})();
