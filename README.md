# Signify — Intelligent Music Discovery & Streaming

Signify is a modern, responsive music streaming and recommendation website with an intelligent client-side scoring engine, Last.fm recommendations, Deezer API integration, and YouTube playback.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Add your free API keys in `.env`:
```env
VITE_LASTFM_API_KEY=your_lastfm_api_key_here
VITE_YOUTUBE_API_KEY=your_youtube_api_key_here
```

### 3. Start Development Server
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 🔑 How to Get Free API Keys

### 1. Last.fm API Key (Free)
1. Go to [https://www.last.fm/api/account/create](https://www.last.fm/api/account/create).
2. Log in or create a free Last.fm account.
3. Fill in the application form:
   - **Contact email**: your email
   - **Application name**: `Signify` (or any name)
   - **Application description**: Music recommendation engine
4. Click **Submit**.
5. Copy the generated **API Key** and paste it into `.env` as `VITE_LASTFM_API_KEY`.

### 2. YouTube Data API v3 Key (Free)
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., `Signify Music`).
3. In the left navigation, go to **APIs & Services** > **Library**.
4. Search for **YouTube Data API v3** and click **Enable**.
5. Go to **APIs & Services** > **Credentials**.
6. Click **+ Create Credentials** > **API key**.
7. Copy the created API Key and paste it into `.env` as `VITE_YOUTUBE_API_KEY`.

---

## 🎧 Features & Architecture

1. **Home Page with Mood Buttons**:
   - 7 mood stations: **Happy (☀️)**, **Sad (🌧️)**, **Chill (☕)**, **Focus (🎯)**, **Workout (⚡)**, **Romantic (💖)**, and **Party (🎉)**.
   - Maps each mood to Last.fm tags (`track.getSimilar`, `tag.getTopTracks`).
2. **Search Bar**:
   - Searches Last.fm and Deezer simultaneously with rich album artwork and instant results.
   - Saves recent search queries with easy one-click search and removal.
3. **Bottom Floating Player Bar**:
   - Glassmorphic player with Play/Pause, Next, Previous, Seek slider, Volume slider with mute toggle.
   - Current song artwork, title, artist, favorite heart toggle, audio source indicator badge (`▶ YouTube Stream` or `🎵 Deezer Preview`).
4. **AUTOPLAY & Session Repetition Protection**:
   - When a track finishes, the next song automatically plays from the recommendation queue.
   - Maintains a session history set so **no track ever repeats within an active listening session**.
5. **Client-Side Recommendation Engine**:
   - Dynamically builds candidate queue from `track.getSimilar` (current song) + `tag.getTopTracks` (selected mood) + Deezer catalog.
   - Scores every candidate:
     $$\text{Score} = \text{Similarity (0-50)} + \text{Mood Match (+30)} + \text{Liked Boost (+25/+40)} - \text{Skip Penalty (up to -65)} - \text{Recent Penalty (-15)} + \text{Random Jitter (\pm 8)}$$
   - Background queue maintains 15 high-ranking tracks and automatically refills when the queue drops below 8.
   - Tracks likes, skips, and listening history in `localStorage`.
6. **"Up Next" Queue Panel**:
   - Interactive slide-out queue panel showing upcoming tracks.
   - **Drag-to-reorder**: Rearrange upcoming songs with native HTML5 drag and drop.
   - **"Radio from this song" (📻)**: Instantly seeds a fresh recommendation queue from any song.
7. **Favorites & Playlists**:
   - Full playlist management and favoriting stored securely in `localStorage`.
8. **24-Hour localStorage Caching & Quota Protection**:
   - All Last.fm, Deezer, and YouTube searches are cached in `localStorage` for 24 hours.
   - **Quota Saver**: YouTube video IDs are resolved **just-in-time ONLY when a song is about to play**, saving YouTube quota.
9. **Resilient Error Handling**:
   - Quota exceeded: Automatic fallback to Deezer 30s preview audio with notification toast.
   - Non-embeddable videos (YouTube error 150/101): Auto-skips to next song with a friendly status message.
   - Network dropouts handled cleanly.
10. **UI Design & Keyboard Shortcuts**:
    - Preserves Signify's signature violet/purple glassmorphic aesthetic and cursive logo.
    - Shortcuts:
      - `Space`: Play / Pause
      - `ArrowRight`: Next Track
      - `ArrowLeft`: Previous Track
      - `M`: Mute / Unmute Volume
