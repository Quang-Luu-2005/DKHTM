# Sentinel frontend

This React/Vite dashboard talks to the Sentinel REST bridge at `/api`. During local
development `vite.config.ts` proxies those requests to `http://localhost:3001`; start
`software/backend` before opening the dashboard.

```powershell
npm install
npm run dev
```

Set `VITE_API_URL` in `.env.local` only when the backend is not reachable through the
Vite proxy. If SSE is offline, the dashboard falls back to REST synchronization and
automatically retries the stream; users, logs and hardware state are not seeded from
browser localStorage.
