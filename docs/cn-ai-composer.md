# CN demo AI Composer

Status on 2026-09-25: the quota migration and `cn-api` Edge Function are live in
the dedicated Supabase demo project. The CN frontend and Netlify Function are
deployed at <https://balisong-cn-demo.netlify.app> in the new `balisong`
credit-based Free team. AI Gateway is enabled. A live teacher request generated
a sample report with `gpt-4o-mini` and charged one demo generation. The original
`jonbarentain` team remains on legacy Free; its CN site still serves
`cn-demo.pauuu.dev`. Moving that domain to the new site requires Netlify's
subdomain ownership TXT verification for the new account, then changing the
Netlify custom-domain assignment and Cloudflare CNAME. The old assignment was
restored after Netlify rejected the new assignment without the TXT record, and
the custom domain still returned HTTP 200. The public Supabase build variables
are configured on the new Netlify site.

The teacher's **Compose Class Report → AI Composer** calls a same-origin Netlify
Function. That Function asks the dedicated `cn-api` Supabase Edge Function to
validate the demo session, confirm schedule ownership, and claim daily quota.
Only then does it call **Netlify AI Gateway** with `gpt-4o-mini`. The teacher
reviews and copies the result. Generated text is not saved until a report is
filed.

The public demo uses fictional data. Known student and teacher names are
replaced with tokens before the model request and restored in the Function's
response. Other details in free-form feedback notes still reach the AI model;
do not enter real student information in the demo.

## Activation

1. The `20260925000100_cn_ai_composer_quota.sql` migration and updated `cn-api`
   Edge Function have already been deployed to the **dedicated demo** Supabase
   project. For another environment, authenticate with a Supabase Personal
   Access Token and deploy them there.

   ```powershell
   npx supabase db push --linked --dry-run
   npx supabase db push --linked
   npx supabase functions deploy cn-api --project-ref ivqfxdibluhgyttgxbmz --use-api
   ```

   On a new PC, log in first with a Personal Access Token:

   ```powershell
   $token = Read-Host "Paste Supabase Personal Access Token"
   npx supabase login --token $token
   Remove-Variable token
   ```

   Do not commit the token or put it in `.env`.
2. Deploy the CN Netlify site from this repository with its configured Functions
   directory. The new site already has a production deployment, which AI Gateway
   requires. The `openai` client uses the Gateway credentials that Netlify
   injects into the Function runtime. No OpenAI or Cloudflare API key is needed.
3. Confirm that the Netlify team is on a credit-based plan and AI features are
   enabled. A live teacher account already generated a sample report. Verify
   that another teacher cannot generate for an unassigned schedule when changing
   account permissions or schedule ownership.

The model call is made only by the Netlify Function. The existing publishable
Supabase key and demo session bearer token authenticate requests to `cn-api`.
The Function uses a fixed URL for the dedicated demo API and accepts no client
specified upstream URL. It returns no Gateway credential to the browser.

Limits: 10 generations per teacher/admin account per UTC day, 30 across the
demo per UTC day, and at least five seconds between generations for an account.
The server enforces these limits atomically in Postgres. Failed model calls
also count against quota. Daily counts reset at 08:00 Asia/Manila. Old quota
rows are pruned during claims.

For local AI testing, run the CN site with `netlify dev` and set
`CN_DEMO_LOCAL_API_URL` to a loopback `http://127.0.0.1:54321/functions/v1/cn-api`
backend. A plain Vite server does not provide the Gateway Function or its
injected credentials.
