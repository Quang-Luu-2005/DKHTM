<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/ddc3f725-e87e-4e58-bfc3-ffd847c45280

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## ESP32 and HiveMQ bridge

Sentinel keeps HiveMQ credentials in the Node/Express process instead of the
browser. The data flow is:

`ESP32 <-> HiveMQ Cloud <-> server.ts <-> /api/events <-> React`

1. Copy `.env.example` to `.env.local` and set the MQTT connection values.
2. Make sure the HiveMQ user can subscribe to `/board/upload/data` and publish
   to `/board/get/data`.
3. Run `npm install`.
4. Run `npm run dev` to start the API on port 3001 and Vite on port 3000.

If Vite is already running, restart it so the `/api` proxy in `vite.config.ts`
is loaded. You can run only the API with `npm run dev:server` while debugging.

The web dashboard receives live board events over Server-Sent Events and sends
the following MQTT actions: `open`, `close`, `normal`, `led_green`, `led_red`,
`buzzer_on`, `buzzer_off`, and `reset_violation`.
