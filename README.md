# Signify

Signify is a React/Vite music discovery and streaming app. Search, recommendations, and playback use Jamendo only. Signify does not use YouTube or extract audio from video services.

Track availability, playback duration, and regional access depend on Jamendo's catalog and the individual track.

## Run locally

Install dependencies:

```bash
npm install
```

Set `JAMENDO_CLIENT_ID` in the root `.env` file, then start the API and frontend
in separate terminals:

```bash
npm run dev:api
```

```bash
npm run dev
```

The app also supports:

```bash
npm run build
npm run lint
```

## Catalogs and library

The app uses Jamendo's public API. Check Jamendo's current API, licensing, and attribution requirements before deploying or redistributing streams.

Favorites, playlists, recent searches, and listening history are stored in this browser's local storage. There is no account service or cross-device synchronization configured.
