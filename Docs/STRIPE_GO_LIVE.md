# Stripe live – checklista (Mormors Kunafa)

## Hur betalning fungerar

1. Frontend anropar `POST /api/orders/checkout-session/:orderId` (backend skapar Stripe Checkout).
2. Kunden betalar på Stripe.
3. Stripe anropar **`POST /api/stripe/webhook`** med `checkout.session.completed`.
4. Backend sätter `payment_status` till `paid` och skickar ordermail.

Utan steg 3–4 kan betalningen lyckas i Stripe men ordern stannar på `pending`.

## Stripe Dashboard (live-läge)

1. **Developers → Webhooks → Add endpoint**
2. **Endpoint URL:** `https://mormors-kunafa-backend.vercel.app/api/stripe/webhook`
3. **Events:** `checkout.session.completed`
4. Kopiera **Signing secret** (`whsec_...`) – det är **inte** samma som test/CLI om du skapade endpoint i live.

## Vercel – backend-projekt

Sätt i **Production** (samma värden som lokalt när du är klar):

| Variabel | Exempel |
|----------|---------|
| `STRIPE_SECRET_KEY` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` från live-webhook ovan |
| `PUBLIC_WEB_APP_URL` | `https://mormorskunafa.se` |
| `FRONTEND_URL` | `https://mormorskunafa.se` |

Efter ändring: **Redeploy** backend.

## Vercel – frontend-projekt

| Variabel | Exempel |
|----------|---------|
| `VITE_API_BASE_URL` | `https://mormors-kunafa-backend.vercel.app/api` |

`VITE_STRIPE_PUBLIC_KEY` används inte i koden idag (server-side Checkout). Redeploy frontend efter env-ändringar.

## Verifiering

1. Lägg en liten kortbeställning på https://mormorskunafa.se
2. Betala med riktigt kort
3. I Stripe → Webhooks → din endpoint: senaste event ska vara **200**
4. Ordern ska ha `payment_status: paid` i admin/databas
5. Bekräftelsemail om kunden har e-post och Resend är konfigurerat

## Vanliga fel

| Symptom | Orsak |
|---------|--------|
| Betalning OK i Stripe, order `pending` | Webhook saknas, fel URL, eller test-`whsec_` med live-`sk_live_` |
| Webhook 400 signature | Fel `STRIPE_WEBHOOK_SECRET` eller body parsas som JSON före webhook-routen (ska vara raw – redan så i `index.ts`) |
| Redirect till localhost efter betalning | `PUBLIC_WEB_APP_URL` inte satt till produktion på Vercel |
