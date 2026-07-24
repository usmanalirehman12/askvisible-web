# AskVisible Live Deployment Guide

This guide explains where the AskVisible server and code are located, how to configure AI provider credentials, how to test the application locally, and how to deploy the current public-checker MVP to Vercel.

> Important: The public AI checker is connected to live provider orchestration. The dashboard still uses demonstration data. Authentication, saved scans, Stripe billing, scheduled scans, and Supabase persistence require additional integration work.

## 1. Project and server locations

The source code is located at:

```text
C:\Users\zayns\OneDrive\Documents\websitefixer
```

When the development server is running, the local addresses are:

```text
Landing page:    http://localhost:3000
Dashboard:       http://localhost:3000/app
Provider status: http://localhost:3000/api/providers
Checker API:     POST http://localhost:3000/api/check
```

In production, Vercel hosts the frontend and runs the API routes as server-side functions. There is no separate always-running server to manage.

The initial production address will resemble:

```text
https://askvisible-web.vercel.app
```

## 2. Obtain AI provider credentials

At least one configured provider is required. Configure all four to offer the complete four-engine check.

### 2.1 OpenAI

1. Visit <https://platform.openai.com/api-keys>.
2. Sign in and create a secret key.
3. Add billing credit and set a usage limit.
4. Save the key securely; it is only shown once.

Environment variables:

```env
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-5.6-luna
```

Documentation: <https://platform.openai.com/docs/quickstart/make-your-first-api-request>

### 2.2 Google Gemini

1. Visit <https://aistudio.google.com/apikey>.
2. Create or select a Google Cloud project.
3. Generate a Gemini API key.
4. Enable billing if required for the expected volume.

Environment variables:

```env
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-3.5-flash
```

Documentation: <https://ai.google.dev/api/generate-content>

### 2.3 Perplexity

1. Visit <https://www.perplexity.ai/settings/api>.
2. Generate an API key.
3. Add payment details or API credit.
4. Save the key securely.

Environment variables:

```env
PERPLEXITY_API_KEY=your_key
PERPLEXITY_MODEL=sonar
```

Documentation: <https://docs.perplexity.ai/api-reference/sonar-post>

### 2.4 Anthropic

1. Visit <https://console.anthropic.com/>.
2. Create a dedicated AskVisible workspace.
3. Add billing credit and a spending limit.
4. Create a production API key.

Environment variables:

```env
ANTHROPIC_API_KEY=your_key
ANTHROPIC_MODEL=claude-haiku-4-5
```

Documentation: <https://platform.claude.com/docs/en/api/typescript/messages/create>

> Never place API keys in source code, GitHub, chat messages, screenshots, or variables beginning with `NEXT_PUBLIC_`.

## 3. Configure credentials locally

Open PowerShell and change to the project directory:

```powershell
Set-Location "C:\Users\zayns\OneDrive\Documents\websitefixer"
Copy-Item .env.example .env.local
notepad .env.local
```

Add the credentials to `.env.local`:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000

OPENAI_API_KEY=sk-your-openai-key
OPENAI_MODEL=gpt-5.6-luna

GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-3.5-flash

PERPLEXITY_API_KEY=pplx-your-key
PERPLEXITY_MODEL=sonar

ANTHROPIC_API_KEY=sk-ant-your-key
ANTHROPIC_MODEL=claude-haiku-4-5
```

The `.env.local` file is excluded by `.gitignore` and must never be committed.

## 4. Install and run locally

Install dependencies:

```powershell
npm.cmd install
```

Start the development server:

```powershell
npm.cmd run dev
```

Open:

```text
http://localhost:3000
```

Environment variables are loaded when the server starts. Restart the server after changing `.env.local`.

## 5. Verify provider configuration

Open:

```text
http://localhost:3000/api/providers
```

With all providers configured, the response should resemble:

```json
{
  "ready": true,
  "configured": [
    { "name": "openai", "model": "gpt-5.6-luna" },
    { "name": "gemini", "model": "gemini-3.5-flash" },
    { "name": "perplexity", "model": "sonar" },
    { "name": "anthropic", "model": "claude-haiku-4-5" }
  ]
}
```

If `ready` is `false`, no recognized provider key was loaded. Confirm the names in `.env.local` and restart the server.

## 6. Test a live AI check

1. Open <http://localhost:3000/#checker>.
2. Enter a real, publicly accessible website.
3. Wait for the configured AI providers to answer.
4. Confirm that the result says **Live scan complete**.
5. Confirm that provider usage appears in the relevant provider dashboards.

The target website must:

- Be publicly accessible.
- Use HTTP or HTTPS.
- Return an HTML page.
- Not resolve to localhost or a private IP address.
- Not require a custom port.

A complete scan using four providers makes twelve AI calls: three buyer prompts multiplied by four providers.

## 7. Run a local production build

Stop the development server with `Ctrl+C`, then run:

```powershell
npm.cmd run build
npm.cmd run start
```

Test the landing page, provider endpoint, and checker again at `http://localhost:3000`.

## 8. Put the project in GitHub

Install one of the following if Git is unavailable:

- GitHub Desktop: <https://desktop.github.com/>
- Git for Windows: <https://git-scm.com/download/win>

Using GitHub Desktop:

1. Open GitHub Desktop.
2. Select **File → Add local repository**.
3. Select `C:\Users\zayns\OneDrive\Documents\websitefixer`.
4. Create a repository there if prompted.
5. Review the changed files.
6. Confirm `.env.local` is not included.
7. Commit the application.
8. Select **Publish repository**.
9. Keep the repository private initially.

Do not upload:

```text
.env.local
node_modules
.next
.npm-cache
```

## 9. Create a Vercel project

1. Create an account at <https://vercel.com/>.
2. Select **Add New → Project**.
3. Connect the GitHub account containing AskVisible.
4. Import the AskVisible repository.
5. Confirm the following settings:

```text
Framework preset: Next.js
Root directory:   ./
Build command:    npm run build
Install command:  npm install
Output directory: Leave at the default
```

Vercel will use the `main` branch as production in the usual configuration. Other branches receive preview deployments.

Documentation: <https://vercel.com/docs/git>

## 10. Add production environment variables to Vercel

In the Vercel project:

1. Select **Settings**.
2. Select **Environment Variables**.
3. Add each variable separately.
4. Mark provider API keys as sensitive.
5. Apply them to **Production**.
6. Apply them to **Preview** only if preview deployments should spend real API credit.

Add:

```text
OPENAI_API_KEY
OPENAI_MODEL
GEMINI_API_KEY
GEMINI_MODEL
PERPLEXITY_API_KEY
PERPLEXITY_MODEL
ANTHROPIC_API_KEY
ANTHROPIC_MODEL
NEXT_PUBLIC_APP_URL
```

Initially set `NEXT_PUBLIC_APP_URL` to the assigned Vercel address:

```text
https://your-project.vercel.app
```

Environment-variable changes apply only to new deployments. Redeploy after adding or updating a variable.

Documentation: <https://vercel.com/docs/environment-variables>

## 11. Deploy the application

1. Start the deployment from the Vercel import screen.
2. Wait for the build to complete.
3. Open the generated `.vercel.app` address.
4. If variables were added after deployment, open **Deployments** and select **Redeploy**.

Test:

```text
https://your-project.vercel.app/
https://your-project.vercel.app/app
https://your-project.vercel.app/api/providers
```

The provider endpoint should return `"ready": true`.

## 12. Enable Vercel Fluid Compute

The checker route declares a maximum duration of 60 seconds because it calls several external services.

In Vercel:

1. Open the project.
2. Select **Settings → Functions**.
3. Locate **Fluid Compute**.
4. Enable it.
5. Redeploy.

For commercial use, prefer Vercel Pro over depending on free-tier execution limits.

Timeout guidance: <https://examples.vercel.com/kb/guide/what-can-i-do-about-vercel-serverless-functions-timing-out>

## 13. Connect a custom domain

1. Open the Vercel project.
2. Select **Settings → Domains**.
3. Add a domain such as `askvisible.com` or `app.askvisible.com`.
4. Copy the DNS record provided by Vercel.
5. Add it through the domain registrar.
6. Wait for verification and HTTPS provisioning.
7. Change `NEXT_PUBLIC_APP_URL` to the custom HTTPS address.
8. Redeploy.

## 14. Troubleshooting

### Provider status says `ready: false`

- Confirm at least one recognized provider key exists.
- Check the environment-variable spelling.
- Restart locally or redeploy on Vercel.

### Checker returns `503`

No AI provider is configured. Check `/api/providers`.

### Checker returns `502`

Provider calls failed. Check:

- API key validity.
- Provider billing credit.
- Model availability for the account.
- Rate limits.
- Vercel function logs.

### Checker times out

- Enable Fluid Compute.
- Inspect provider latency in Vercel logs.
- Reduce the number of providers temporarily.
- Move long-running scans to a background queue before increasing public traffic.

### Site has HTML but no styling

Locally, stop the server, remove `.next`, and restart:

```powershell
Remove-Item -Recurse -Force .next
npm.cmd run dev
```

In Vercel, trigger a clean redeployment.

## 15. Features currently operational

Once provider keys are configured, the following are operational:

- Marketing site.
- Dashboard demonstration.
- Public website and brand discovery.
- Live multi-provider checker.
- Mention detection.
- Basic position and sentiment analysis.
- Citation extraction.
- Visibility scoring.
- Retry and partial-failure handling.
- Basic rate limiting and caching.

## 16. Features requiring further development

The following are represented in the strategy or interface but are not connected end to end:

- Registration and login.
- Supabase persistence.
- Saved brands and scan history.
- Customer workspaces.
- Real dashboard data.
- Stripe subscriptions and plan enforcement.
- Inngest or Trigger.dev scheduled scans.
- Resend email alerts and reports.
- PostHog analytics.
- PDF and CSV report generation.
- Distributed rate limiting.

The proposed database schema is located at:

```text
supabase/schema.sql
```

Creating a Supabase project and applying the schema does not by itself connect the application. Supabase application queries, authentication, and persistence still need implementation.

Supabase migration documentation: <https://supabase.com/docs/guides/deployment/database-migrations>

## 17. Required production hardening

Before sending paid traffic:

1. Replace in-memory rate limiting with shared Redis or Upstash storage.
2. Add CAPTCHA or Cloudflare Turnstile.
3. Add per-customer usage quotas and cost limits.
4. Configure provider spending alerts.
5. Use separate development and production provider keys.
6. Move scheduled and high-volume scans to Inngest or Trigger.dev.
7. Add Supabase authentication and persistent scan history.
8. Add error monitoring such as Sentry.
9. Add privacy, terms, cookie, and acceptable-use pages.
10. Monitor checker duration, provider error rates, and API expenditure.

## 18. Quick launch checklist

- [ ] Obtain at least one provider API key.
- [ ] Add keys to local `.env.local`.
- [ ] Restart the development server.
- [ ] Confirm `/api/providers` reports `ready: true`.
- [ ] Complete a live local check.
- [ ] Run `npm.cmd run build` successfully.
- [ ] Publish the code to a private GitHub repository.
- [ ] Import the repository into Vercel.
- [ ] Add sensitive production environment variables in Vercel.
- [ ] Deploy or redeploy.
- [ ] Enable Fluid Compute.
- [ ] Test all live routes.
- [ ] Add and verify the custom domain.
- [ ] Configure provider spending alerts.
