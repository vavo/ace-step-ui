# Runtime And Redeploy Notes

This app must be served by its Node server. Opening `index.html` directly with `file://` skips the API, auth cookies, OAuth callback route, static audio serving, and server-side config. That path is useful only for discovering new ways to be annoyed.

## Local Development

```bash
cd /Users/vavo/DEV/acestep/ace-step-ui
cp .env.example .env
npm install
npm --prefix server install
./start.sh
```

Open `http://localhost:3000`.

Development mode allows the local nickname login path. Google OAuth is still supported when the Google variables are configured.

## Production-like Local Runtime

```bash
cd /Users/vavo/DEV/acestep/ace-step-ui
git pull origin main

npm install
npm --prefix server install

npm --prefix server run build
npm run build

NODE_ENV=production PORT=3001 npm --prefix server start
```

Open `http://localhost:3001`.

If another process already owns port `3001`, stop it first or choose another `PORT` and update `FRONTEND_URL`, `PUBLIC_API_URL`, and `GOOGLE_OAUTH_CALLBACK_URL` to match.

For RunPod proxy runtime on port `7777`:

```bash
export NODE_ENV=production
export PORT=7777
export FRONTEND_URL=https://your-7777.proxy.runpod.net
export PUBLIC_API_URL=https://your-7777.proxy.runpod.net
export GOOGLE_OAUTH_CALLBACK_URL=https://your-7777.proxy.runpod.net/api/auth/google/callback

npm --prefix server start
```

Use the exact generated RunPod proxy host. Also register the exact Google callback URL in Google Cloud Console.

## Required Environment

For local production-like runtime:

```env
NODE_ENV=production
PORT=3001
FRONTEND_URL=http://localhost:3001
PUBLIC_API_URL=http://localhost:3001
GOOGLE_OAUTH_CALLBACK_URL=http://localhost:3001/api/auth/google/callback
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
FORMAT_PROVIDER=openai
JWT_SECRET=replace_with_a_long_random_secret
AUTH_SESSION_DAYS=30
PRODUCT_TIME_ZONE=Europe/Bratislava
ACESTEP_API_URL=http://localhost:8001
```

For a real deployment, use one HTTPS origin everywhere:

```env
FRONTEND_URL=https://your-domain.example
PUBLIC_API_URL=https://your-domain.example
GOOGLE_OAUTH_CALLBACK_URL=https://your-domain.example/api/auth/google/callback
```

Register that exact Google callback URL in Google Cloud Console.

## Auth Behavior

- `NODE_ENV=production`: Google OAuth only. Nickname login is disabled.
- `NODE_ENV=development`: nickname login is available for local testing.
- The app uses httpOnly session cookies after login.

## Python Runtime

The Python scripts under `server/scripts` are thin wrappers around ACE-Step. Run them with the ACE-Step Python environment and set `ACESTEP_PATH` or `PYTHON_PATH` when your install is not in the default location.
