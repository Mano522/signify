# Signify

Signify is a React/Vite music discovery and streaming app. Search and recommendations query Audius, Jamendo, and Deezer independently, then show playable results from any provider that responds. The player tries another available provider stream for a track when its current stream fails. Signify does not use YouTube or extract audio from video services.

Audius and Jamendo can provide full streams for tracks in their catalogs. Deezer generally provides short previews. Availability, playback duration, and regional access depend on each provider and track; no provider has every song.

## Run locally

```bash
npm install
npm run dev
```

The app also supports:

```bash
npm run build
npm run lint
```

## Catalogs and library

The app uses the Audius discovery API, Jamendo's public API, and Deezer search/chart endpoints. Check each provider's current API, licensing, and attribution requirements before deploying or redistributing streams.

Favorites, playlists, recent searches, and listening history are stored in this browser's local storage. There is no account service or cross-device synchronization configured.
