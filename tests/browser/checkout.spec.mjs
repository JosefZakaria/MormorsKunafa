import { test, expect } from '@playwright/test';
const origin='http://127.0.0.1:4179';

async function submitCheckout(page,button=page.getByRole('button',{name:'Gå till betalning'})) {
  await button.click();
  const closedHoursConfirmation=page.getByRole('button',{name:/^Ja, jag vill att min beställning ska vara klar /});
  if (await closedHoursConfirmation.isVisible()) {
    await closedHoursConfirmation.click();
  }
}

test.beforeEach(async ({context}) => {
  await context.route('**/*', async route => {
    const url=new URL(route.request().url());
    if (url.origin===origin) return route.continue();
    // Simulated hosted checkout: no network request reaches Stripe.
    if (url.origin==='https://checkout.stripe.com') {
      const sessionId=url.pathname.split('/').pop();
      const response=await context.request.post(`${origin}/__test/pay/${sessionId}`);
      expect(response.ok()).toBeTruthy();
      const {url:target}=await response.json();
      return route.fulfill({status:302,headers:{location:target},body:''});
    }
    return route.abort('blockedbyclient');
  });
});

for (const location of ['Höja','Möllevången']) {
  test(`purchase, simulated payment return and private status at ${location}`,async ({page})=> {
    test.setTimeout(60_000);
    await page.goto('/');
    await page.getByRole('button',{name:/Ta med/i}).first().click();
    await page.getByRole('button',{name:new RegExp(location)}).click();
    await page.getByRole('button',{name:'Visa Syntetisk baklawa'}).click();
    await page.locator('#menu-product-option').selectOption('250 gram');
    await page.getByRole('button',{name:/Lägg till/i}).click();
    await page.getByRole('button',{name:/VARUKORG/i}).click();
    await page.locator('#customer-first-name').fill('Synthetic');
    await page.locator('#customer-last-name').fill('Customer');
    await page.locator('#customer-phone').fill('0700000000');
    await page.locator('#customer-email').fill('browser@example.test');
    await page.locator('#cart-schedule-date').fill(new Date(Date.now()+86400000).toISOString().slice(0,10));
    await page.getByRole('checkbox').check();
    await submitCheckout(page);
    await expect(page).toHaveURL(/\/status\?orderId=/,{timeout:20_000});
    await expect(page.getByText(/^Beställning #\d+$/)).toBeVisible({timeout:20_000});
    await expect(page.getByRole('heading',{name:'Din förbeställning är bokad'})).toBeVisible();
    await expect(page.locator('.timer-display')).toHaveCount(0);
    await expect(page.locator('.status-message')).toContainText(location);
    await expect(page.locator('body')).not.toContainText('browser@example.test');
    await page.reload();
    await expect(page.locator('body')).not.toContainText('browser@example.test');
  });
}

test('status presentation preserves unpaid, delivery and terminal states without customer data',async({page})=>{
  const id='9f0e4b27-30f1-4eee-9f18-004766113333';
  const token=`v1.9999999999.${'a'.repeat(22)}.${'b'.repeat(43)}`;
  await page.addInitScript(({id,token})=>sessionStorage.setItem(`order-status-token:${id}`,token),{id,token});
  let status={orderNumber:'#10042',status:'ny',paymentStatus:'pending',orderType:'takeaway',estimatedReadyTime:new Date(Date.now()+3600000).toISOString()};
  await page.route(`**/api/orders/${id}`,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(status)}));
  await page.goto(`/status?orderId=${id}`);
  await expect(page.getByRole('heading',{name:'Väntar på betalning'})).toBeVisible();
  await expect(page.locator('.timer-display')).toHaveCount(0);
  status={...status,paymentStatus:'paid',orderType:'delivery'};
  await page.reload();
  await expect(page.locator('.status-message')).toContainText('1–2 arbetsdagar');
  await expect(page.locator('.timer-display')).toHaveCount(0);
  status={...status,status:'levererad'};
  await page.reload();
  await expect(page.getByRole('heading',{name:'Beställningen är levererad'})).toBeVisible();
});

test('a tokenless legacy status link stays local and shows staffed help',async({page})=>{
  const id='9f0e4b27-30f1-4eee-9f18-004766114444';
  let statusRequests=0;
  page.on('request',request=>{
    if (request.url().endsWith(`/api/orders/${id}`)) statusRequests++;
  });
  await page.goto(`/status?orderId=${id}&session_id=cs_legacy_browser`);
  await expect(page.getByRole('heading',{name:'Orderstatus kan inte visas här'})).toBeVisible();
  await expect(page.getByText('inga order- eller betalningsuppgifter',{exact:false})).toBeVisible();
  const statusCard=page.locator('.status-card');
  await expect(statusCard.getByRole('link',{name:'072-868 25 92'})).toBeVisible();
  await expect(statusCard.getByRole('link',{name:'Mormorskunafa@gmail.com'})).toBeVisible();
  await page.waitForTimeout(200);
  expect(statusRequests).toBe(0);
});

test('custom piece products keep the unit price when cart quantity changes', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:/Ta med/i}).first().click();
  await page.getByRole('button',{name:/Höja/}).click();
  await page.getByRole('button',{name:'Visa Syntetiskt bröd'}).click();
  await page.getByRole('button',{name:'Öka antal'}).click();
  await page.getByRole('button',{name:'Öka antal'}).click();
  await page.getByRole('button',{name:/Lägg till/i}).click();
  await page.getByRole('button',{name:/VARUKORG/i}).click();
  await expect(page.locator('.quantity-value')).toHaveText('3');
  await page.locator('.cart-item').getByRole('button',{name:'+',exact:true}).click();
  await expect(page.locator('.quantity-value')).toHaveText('4');
  await page.locator('#customer-first-name').fill('Synthetic');
  await page.locator('#customer-last-name').fill('Bread');
  await page.locator('#customer-phone').fill('0700000001');
  await page.locator('#customer-email').fill('bread@example.test');
  await page.locator('#cart-schedule-date').fill(new Date(Date.now()+86400000).toISOString().slice(0,10));
  await page.getByRole('checkbox').check();
  const created = page.waitForResponse(response=>response.url().endsWith('/api/orders') && response.request().method()==='POST');
  await submitCheckout(page);
  const response = await created;
  expect(response.status()).toBe(201);
  expect(response.request().headers()['x-checkout-contract']).toBe('order-v2');
  expect(response.request().postDataJSON().items).toEqual([{
    productId:'65a74ec3-afd2-4c49-a8a1-ea3d87d4255c-st',
    variantId:'st',
    productName:'Syntetiskt bröd',
    price:4500,
    quantity:4,
  }]);
  expect((await response.json()).checkoutContract).toBe('order-v2');
  expect((await response.json()).totalPrice).toBe(18000);
  await expect(page).toHaveURL(/\/status\?orderId=/);
});

test('an upgrade rejection keeps the cart and never starts payment automatically',async({page})=>{
  let creates=0, paymentStarts=0;
  await page.route('**/api/orders',route=>{
    if (route.request().method() !== 'POST') return route.continue();
    creates++;
    expect(route.request().headers()['x-checkout-contract']).toBe('order-v2');
    return route.fulfill({status:426,contentType:'application/json',body:JSON.stringify({
      code:'CLIENT_UPGRADE_REQUIRED',
      error:'Den här sidan är inaktuell. Ladda om sidan innan du försöker igen.',
    })});
  });
  await page.route('**/api/orders/checkout-session/**',route=>{
    paymentStarts++;
    return route.abort('blockedbyclient');
  });

  await page.goto('/');
  await page.getByRole('button',{name:/Ta med/i}).first().click();
  await page.getByRole('button',{name:/Höja/}).click();
  await page.getByRole('button',{name:'Visa Syntetisk baklawa'}).click();
  await page.locator('#menu-product-option').selectOption('250 gram');
  await page.getByRole('button',{name:/Lägg till/i}).click();
  await page.getByRole('button',{name:/VARUKORG/i}).click();
  await page.locator('#customer-first-name').fill('Synthetic');
  await page.locator('#customer-last-name').fill('Upgrade');
  await page.locator('#customer-phone').fill('0700000002');
  await page.locator('#cart-schedule-date').fill(new Date(Date.now()+86400000).toISOString().slice(0,10));
  await page.getByRole('checkbox').check();
  await submitCheckout(page);

  await expect(page.getByText('Den här sidan är inaktuell.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Ladda om sidan'})).toBeVisible();
  await expect(page.locator('.cart-item')).toHaveCount(1);
  await page.waitForTimeout(200);
  expect(creates).toBe(1);
  expect(paymentStarts).toBe(0);
  expect(await page.evaluate(()=>sessionStorage.getItem('pending-checkout-create'))).toBeNull();
  expect(await page.evaluate(()=>localStorage.getItem('mormors-kunafa-cart'))).toBeTruthy();
});

test('a committed order with a lost response cannot be created again after reload',async({page,context})=>{
  const phone = test.info().project.name === 'desktop' ? '0700000004' : '0700000005';
  let creates=0;
  let committedOrderId='';
  await page.route('**/api/orders',async route=>{
    if (route.request().method() !== 'POST') return route.continue();
    creates++;
    const response=await route.fetch();
    expect(response.status()).toBe(201);
    committedOrderId=(await response.json()).id;
    expect(committedOrderId).toMatch(/^[0-9a-f-]{36}$/);
    await route.abort('failed');
  });

  await page.goto('/');
  await page.getByRole('button',{name:/Ta med/i}).first().click();
  await page.getByRole('button',{name:/Höja/}).click();
  await page.getByRole('button',{name:'Visa Syntetisk baklawa'}).click();
  await page.locator('#menu-product-option').selectOption('250 gram');
  await page.getByRole('button',{name:/Lägg till/i}).click();
  await page.getByRole('button',{name:/VARUKORG/i}).click();
  await page.locator('#customer-first-name').fill('Synthetic');
  await page.locator('#customer-last-name').fill('Lost create');
  await page.locator('#customer-phone').fill(phone);
  await page.locator('#cart-schedule-date').fill(new Date(Date.now()+86400000).toISOString().slice(0,10));
  await page.getByRole('checkbox').check();
  const checkoutButton=page.getByRole('button',{name:'Gå till betalning'});
  await submitCheckout(page,checkoutButton);

  await expect(page.getByText('Betala eller beställ inte igen',{exact:false})).toBeVisible();
  expect(creates).toBe(1);
  const createMarker=await page.evaluate(()=>sessionStorage.getItem('pending-checkout-create'));
  expect(createMarker).toBeTruthy();
  expect(createMarker).not.toContain(phone);
  expect(await page.evaluate(()=>sessionStorage.getItem('pending-checkout-order'))).toBeNull();

  await page.reload();
  await expect(page.locator('.cart-item')).toHaveCount(1);
  await submitCheckout(page);
  await expect(page.getByText('Betala eller beställ inte igen',{exact:false})).toBeVisible();
  await page.waitForTimeout(200);
  expect(creates).toBe(1);

  const countResponse=await context.request.get(
    `${origin}/__test/order-count?phone=${encodeURIComponent(phone)}`,
    {headers:{'x-test-run':test.info().config.metadata.browserRunId}}
  );
  expect(countResponse.status()).toBe(200);
  expect(await countResponse.json()).toEqual({count:1});
  expect(committedOrderId).toBeTruthy();
});

test('a lost legacy payment response cannot be resubmitted',async({page})=>{
  const legacyOrderId='9f0e4b27-30f1-4eee-9f18-004766115555';
  let creates=0, paymentStarts=0;
  await page.route('**/api/orders',route=>{
    if (route.request().method() !== 'POST') return route.continue();
    creates++;
    const [line]=route.request().postDataJSON().items;
    expect(line.productId).toMatch(/^[0-9a-f-]{36}-250 gram$/);
    expect(line.productName).toContain('Syntetisk baklawa');
    expect(line.price).toBe(9900);
    return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({
      id:legacyOrderId,
      orderNumber:'#1042',
    })});
  });
  await page.route(`**/api/orders/checkout-session/${legacyOrderId}`,route=>{
    paymentStarts++;
    expect(route.request().headers()['x-checkout-contract']).toBeUndefined();
    expect(route.request().headers()['x-order-status-token']).toBeUndefined();
    return route.abort('failed');
  });

  await page.goto('/');
  await page.getByRole('button',{name:/Ta med/i}).first().click();
  await page.getByRole('button',{name:/Höja/}).click();
  await page.getByRole('button',{name:'Visa Syntetisk baklawa'}).click();
  await page.locator('#menu-product-option').selectOption('250 gram');
  await page.getByRole('button',{name:/Lägg till/i}).click();
  await page.getByRole('button',{name:/VARUKORG/i}).click();
  await page.locator('#customer-first-name').fill('Synthetic');
  await page.locator('#customer-last-name').fill('Legacy');
  await page.locator('#customer-phone').fill('0700000003');
  await page.locator('#cart-schedule-date').fill(new Date(Date.now()+86400000).toISOString().slice(0,10));
  await page.getByRole('checkbox').check();
  const checkoutButton=page.getByRole('button',{name:'Gå till betalning'});
  await submitCheckout(page,checkoutButton);

  await expect(page.getByText('Betala eller beställ inte igen',{exact:false})).toBeVisible();
  await expect(page.locator('.cart-item')).toHaveCount(1);
  await expect(checkoutButton).toBeEnabled();
  expect({creates,paymentStarts}).toEqual({creates:1,paymentStarts:1});

  await submitCheckout(page,checkoutButton);
  await page.waitForTimeout(200);
  expect({creates,paymentStarts}).toEqual({creates:1,paymentStarts:1});
  expect(await page.evaluate(()=>localStorage.getItem('mormors-kunafa-cart'))).toBeTruthy();
});

test('admin cookie login, current dashboard and logout', async ({page,context})=> {
  const active = page.waitForResponse(r=>r.url().includes('/api/orders/admin/active'));
  const preorders = page.waitForResponse(r=>r.url().includes('/api/orders/admin/pre-orders'));
  await page.goto('/admin/login');
  await page.getByLabel('E-post',{exact:true}).fill('owner@example.test');
  await page.getByLabel('Lösenord',{exact:true}).fill('Synthetic-local-password-42');
  await page.getByRole('button',{name:'Logga in',exact:true}).click();
  await expect(page).toHaveURL(/admin\/dashboard/);
  await expect(page.getByRole('button',{name:/Meny/i}).first()).toBeVisible();
  expect((await active).status()).toBe(200);
  expect((await preorders).status()).toBe(200);
  await page.screenshot({path:`.cache/security-test/admin-${test.info().project.name}.png`,fullPage:true});
  const cookies=await context.cookies();
  expect(cookies.find(c=>c.name==='mk_admin_session').httpOnly).toBeTruthy();
  expect(await page.evaluate(()=>Object.keys(localStorage).some(k=>/token|admin_info/.test(k)))).toBeFalsy();
  const oldCookie=cookies.filter(c=>['mk_admin_session','mk_csrf'].includes(c.name)).map(c=>`${c.name}=${c.value}`).join('; ');
  await page.route('**/api/admin/logout',route=>route.abort('failed'));
  await page.getByRole('button',{name:/Logga ut/i}).click();
  await expect(page.getByRole('alert').filter({hasText:'Utloggningen kunde inte bekräftas'})).toBeVisible();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByRole('button',{name:/Logga ut/i})).toBeEnabled();
  expect((await context.request.get('/api/admin/session')).status()).toBe(200);
  await page.reload();
  await expect(page).toHaveURL(/dashboard/);
  await page.unroute('**/api/admin/logout');
  const logoutResponse=page.waitForResponse(r=>r.url().endsWith('/api/admin/logout'));
  await page.getByRole('button',{name:/Logga ut/i}).click();
  expect((await logoutResponse).status()).toBe(204);
  await expect(page).not.toHaveURL(/dashboard/);
  expect((await context.cookies()).some(c=>c.name==='mk_admin_session')).toBeFalsy();
  expect((await context.request.get('/api/admin/session',{headers:{cookie:oldCookie}})).status()).toBe(401);
  await page.reload();
  await expect(page).not.toHaveURL(/dashboard/);
});

test('logout can retry after the server revoked the session but its response was lost',async({page,context})=>{
  await page.goto('/admin/login');
  await page.getByLabel('E-post',{exact:true}).fill('owner@example.test');
  await page.getByLabel('Lösenord',{exact:true}).fill('Synthetic-local-password-42');
  await page.getByRole('button',{name:'Logga in',exact:true}).click();
  await expect(page).toHaveURL(/admin\/dashboard/);
  await page.route('**/api/admin/logout',async route=>{
    const response=await route.fetch();
    expect(response.status()).toBe(204);
    await route.abort('failed');
  });
  await page.getByRole('button',{name:/Logga ut/i}).click();
  await expect(page.getByRole('alert').filter({hasText:'Utloggningen kunde inte bekräftas'})).toBeVisible();
  expect((await context.request.get('/api/admin/session')).status()).toBe(401);
  await page.unroute('**/api/admin/logout');
  await page.getByRole('button',{name:/Logga ut/i}).click();
  await expect(page).not.toHaveURL(/dashboard/);
  expect((await context.cookies()).some(c=>c.name==='mk_admin_session')).toBeFalsy();
});

test('pending duplicate refund recovery requires explicit authorization', async ({page}) => {
  const eventId = 'evt_test_pending_browser_refund';
  const detail = { eventId, status: 'pending', orderNumber: '#1042', amount: 9900,
    confirmation: 'ÅTERBETALA DUBBELBETALNING #1042' };
  let submitted = 0;
  await page.route('**/api/admin/payment-alerts', route => route.fulfill({json:[{
    eventId, eventType:'checkout.session.completed',outcome:'alert_paid_session_validation_failed',receivedAt:new Date().toISOString(),
  }]}));
  await page.route(`**/api/admin/payment-alerts/${eventId}`, route => route.fulfill({json:detail}));
  await page.route(`**/api/admin/payment-alerts/${eventId}/refund`, route => {
    const body = route.request().postDataJSON();
    expect(body.confirmation).toBe(detail.confirmation);
    expect(body.password).toBe('Synthetic-local-password-42');
    expect(route.request().headers()['x-csrf-token']).toBeTruthy();
    submitted++;
    return route.fulfill({json:{...detail,status:'succeeded'}});
  });
  await page.goto('/admin/login');
  await page.getByLabel('E-post',{exact:true}).fill('owner@example.test');
  await page.getByLabel('Lösenord',{exact:true}).fill('Synthetic-local-password-42');
  await page.getByRole('button',{name:'Logga in',exact:true}).click();
  await page.getByRole('button',{name:'Granska larm'}).click();
  await expect(page.getByText('Resultatet är ännu inte bekräftat.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Stäm av / återförsök'}).click();
  expect(submitted).toBe(0);
  await expect(page.getByRole('button',{name:'Stäm av / återförsök'})).toBeDisabled();
  await page.getByLabel('Återbetalningslösenord',{exact:true}).fill('Synthetic-local-password-42');
  await page.locator('#duplicate-refund-confirmation').fill(detail.confirmation);
  await page.getByRole('button',{name:'Stäm av / återförsök'}).click();
  await expect(page.getByText('Dubbelbetalningen är återbetald.')).toBeVisible();
  expect(submitted).toBe(1);
});
