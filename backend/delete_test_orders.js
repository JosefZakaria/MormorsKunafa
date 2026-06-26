import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

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

  const testOrderNumbers = ['#1005', '#2169', '#5265'];

  console.log('⏳ Hämtar testordrar från Supabase...');

  // 1. Hämta id:n på testordrarna
  const { data: orders, error: fetchError } = await supabase
    .from('orders')
    .select('id, order_number')
    .in('order_number', testOrderNumbers);

  if (fetchError) {
    console.error('❌ Fel vid hämtning av ordrar:', fetchError);
    process.exit(1);
  }

  if (!orders || orders.length === 0) {
    console.log('✅ Inga testordrar hittades i databasen.');
    process.exit(0);
  }

  const ids = orders.map(o => o.id);
  console.log(`Hittade ${orders.length} st testordrar:`, orders.map(o => o.order_number).join(', '));

  // 2. Ta bort orderrader (items) först för att undvika foreign key-krockar
  console.log('⏳ Tar bort orderrader...');
  const { error: itemsError } = await supabase
    .from('order_items')
    .delete()
    .in('order_id', ids);

  if (itemsError) {
    console.error('❌ Fel vid borttagning av orderrader:', itemsError);
    process.exit(1);
  }

  // 3. Ta bort själva ordrarna
  console.log('⏳ Tar bort själva ordrarna...');
  const { error: ordersError } = await supabase
    .from('orders')
    .delete()
    .in('id', ids);

  if (ordersError) {
    console.error('❌ Fel vid borttagning av ordrar:', ordersError);
    process.exit(1);
  }

  console.log('✅ Alla testbeställningar har raderats permanent från Supabase!');
})();
