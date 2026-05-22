# Vercel deploy — felsökning

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
- `FRONTEND_URL` eller `PUBLIC_WEB_APP_URL` = `https://mormorskunafa.se`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (om kortbetalning ska fungera)
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SITE_PUBLIC_URL` (om ordermail ska skickas)

Se `backend/.env.example` för full lista.

## Verifiera efter deploy

1. Öppna `https://mormors-kunafa-backend.vercel.app/api/health`
   - **OK:** `{"ok":true,"supabase":true,"jwtConfigured":true}`
   - **Saknar Supabase:** `503` med tydligt felmeddelande → lägg till env och **Redeploy**
2. Öppna `https://mormors-kunafa-backend.vercel.app/api/products` → JSON med produkter
3. Ladda `https://mormorskunafa.se/menu`

## Frontend

I **webbprojektets** Vercel-env (Production):

```
VITE_API_BASE_URL=https://mormors-kunafa-backend.vercel.app/api
VITE_STRIPE_PUBLIC_KEY=pk_live_...
```

`.env` i repot påverkar bara lokal build om du inte sätter samma variabler i Vercel.

## Vanliga fel

| Symptom | Orsak | Åtgärd |
|---------|--------|--------|
| `FUNCTION_INVOCATION_FAILED` / 500 på alla routes | TypeScript-fel i kod eller krasch vid import | Kör `npm run build --workspace=@mormors-kunafa/backend` lokalt; fixa fel; push + redeploy |
| Health 503 + Supabase-meddelande | Env saknas på Vercel | Lägg till `SUPABASE_*`, redeploy |
| Meny: `Failed to fetch` | Backend nere eller CORS | Fixa backend först; kontrollera `FRONTEND_URL` |
| Admin login funkar inte | `JWT_SECRET` saknas/ändrats | Samma `JWT_SECRET` som vid skapande av admin-token |

## Redeploy

Efter ändring av env: **Deployments → … → Redeploy** (Build Cache kan lämnas på).
