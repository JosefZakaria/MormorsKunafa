# Vercel deploy — felsökning

`npm run verify:web-deployment` kontrollerar committade Vercel-rewrites,
globala säkerhetsheaders, privata cache-regler, juridiska klientroutes, sitemap,
robots och security.txt. Kontrollen körs av `npm run check` och CI. Den bevisar
lokal konfiguration, inte live-deployment; verifiera motsvarande URL:er och
response-headers i produktion efter varje deployment.

## Projekt

| App | Vercel-projekt | Root directory |
|-----|----------------|----------------|
| Webb | (frontend) | `apps/web` |
| API | `mormors-kunafa-backend` | `backend` |

## Backend — obligatoriska miljövariabler

Kopiera värden från lokal `backend/.env` till **Vercel → Project → Settings → Environment Variables** (Production + Preview):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET` (sätt ett starkt hemligt värde i produktion)
- `CRON_SECRET` (unik slumpsträng på minst 32 bytes; autentiserar Vercel Cron)
- `FRONTEND_URL` eller `PUBLIC_WEB_APP_URL` = `https://mormorskunafa.se`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (om kortbetalning ska fungera)
- `REFUND_PASSWORD_HASH` (bcrypt cost minst 10; endast hash, aldrig refund-lösenordet i klartext)
- `PUBLIC_WEB_APP_URL=https://mormorskunafa.se` (**krävs** för Stripe-återvändning efter kortbetalning — annars hamnar kunden på `localhost:5173`)
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SITE_PUBLIC_URL` (om ordermail ska skickas)

Se `backend/.env.example` för full lista.

## Verifiera efter deploy

Innan backend deployas ska de versionshanterade Supabase-migrationerna i
`backend/src/db/migrations` granskas, backup tas och migrationerna appliceras i
filnamnsordning. Backend och cronjobb avsiktligt failar stängt om deras
databasfunktioner eller obligatoriska secrets saknas.

1. Öppna `https://mormors-kunafa-backend.vercel.app/api/health`
   - **OK:** `{"ok":true,"publicWebAppUrl":"https://mormorskunafa.se","stripeWebhookConfigured":true,"deployWarnings":[]}`
   - **`deployWarnings` innehåller text** → läs varningarna (t.ex. saknad `PUBLIC_WEB_APP_URL` eller webhook)
   - **Saknar Supabase:** `503` med tydligt felmeddelande → lägg till env och **Redeploy**
2. Öppna `https://mormors-kunafa-backend.vercel.app/api/products` → JSON med produkter
3. Ladda `https://mormorskunafa.se/menu`
4. Kontrollera Vercel **Settings → Cron Jobs**. Den dagliga gallringen tar endast
   bort checkoututkast som varit pending i minst 48 timmar och aldrig fått ett
   Stripe- eller Swish-ID. Initierade betalningar måste provider-avstämmas först.
5. Kontrollera att Stripe-webhooken prenumererar på `checkout.session.completed`,
   `refund.created`, `refund.updated` och `refund.failed`. Testa delrefund och
   full refund i provider-testläge före riktiga pengar används.

## Frontend

I **webbprojektets** Vercel-env (Production):

```
VITE_API_BASE_URL=https://mormors-kunafa-backend.vercel.app/api
VITE_STRIPE_PUBLIC_KEY=pk_live_...
```

`.env` i repot påverkar bara lokal build om du inte sätter samma variabler i Vercel.

## Vercel Project Settings (viktigt)

Felet *"No Output Directory named **public** found"* betyder att fel inställning används i dashboard.

| Projekt | Root Directory | Output Directory | Framework |
|---------|----------------|------------------|-----------|
| **Backend** (`mormors-kunafa-backend`) | `backend` | **Tom / Override off** — ingen statisk mapp | Other (eller låt `vercel.json` styra) |
| **Webb** (mormorskunafa.se) | `apps/web` | **`dist`** (styrs av `apps/web/vercel.json`) | Vite |

Gå till **Settings → General → Build & Development Settings** och ta bort `public` om det står där. Spara och **Redeploy**.

## Vanliga fel

| Symptom | Orsak | Åtgärd |
|---------|--------|--------|
| `No Output Directory named "public"` | Fel Root Directory eller Output = `public` i Vercel | Backend: root `backend`, tom output. Webb: root `apps/web`, output `dist` |
| `FUNCTION_INVOCATION_FAILED` / 500 på alla routes | TypeScript-fel i kod eller krasch vid import | Kör `npm run build --workspace=@mormors-kunafa/backend` lokalt; fixa fel; push + redeploy |
| Health 503 + Supabase-meddelande | Env saknas på Vercel | Lägg till `SUPABASE_*`, redeploy |
| Meny: `Failed to fetch` | Backend nere eller CORS | Fixa backend först; kontrollera `FRONTEND_URL` |
| Admin login funkar inte | `JWT_SECRET` saknas/ändrats | Samma `JWT_SECRET` som vid skapande av admin-token |
| Efter kortbetalning: `localhost:5173` / ingen bekräftelse | `PUBLIC_WEB_APP_URL` saknas på Vercel-backend | Sätt `https://mormorskunafa.se`, redeploy backend + webb |
| Status står kvar på "Bekräftar betalning" | Stripe-webhook når inte API | Stripe Dashboard → Webhooks → `https://mormors-kunafa-backend.vercel.app/api/stripe/webhook` + rätt `whsec_` |

## Redeploy

Efter ändring av env: **Deployments → … → Redeploy** (Build Cache kan lämnas på).
