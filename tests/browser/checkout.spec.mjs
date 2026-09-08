import { test, expect } from '@playwright/test';
const origin='http://127.0.0.1:4179';

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
    await page.getByRole('button',{name:'Gå till betalning'}).click();
    await expect(page).toHaveURL(/\/status\?orderId=/);
    await expect(page.getByText(/^Beställning #\d+$/)).toBeVisible();
    await expect(page.locator('body')).not.toContainText('browser@example.test');
    await page.reload();
    await expect(page.locator('body')).not.toContainText('browser@example.test');
  });
}

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
  await page.getByRole('button',{name:/Logga ut/i}).click();
  await expect(page).not.toHaveURL(/dashboard/);
});
