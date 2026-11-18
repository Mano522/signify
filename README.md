# Signify

Signify is a React/Vite music discovery and streaming app. It searches and plays tracks provided by the Jamendo and Audius APIs; it does not use YouTube or extract audio from video services. Track availability and playback quality depend on each catalog.

## Run locally

```bash
npm install
npm run dev
```

The app also supports `npm run build` and `npm run lint`.

## Catalogs and library

Search and recommendations combine results from the public Jamendo and Audius catalogs. Favorite tracks, playlists, recent searches, and listening history are stored in this browser's local storage. There is no account service or cross-device synchronization configured.

Jamendo's public API client identifier is configured in `src/services/jamendoService.js`. Check the providers' current API and licensing terms before deploying or redistributing catalog streams.
# signify
