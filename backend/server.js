import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { env } from 'node:process';

const app = express();

app.use(cors());
app.use(express.json());

const parseLimit = (value) => {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return 20;
  return Math.min(Math.max(Number(value), 1), 50);
};

const toJamendoTrack = (track) => ({
  id: track.id,
  title: track.name,
  artist: track.artist_name,
  album: track.album_name,
  artwork: track.album_image || track.image,
  duration: track.duration,
  audio: track.audio,
  downloadAllowed: track.audiodownload_allowed,
  licenses: track.licenses || [],
  provider: 'Jamendo',
});

const sendJamendoTracks = async (res, params) => {
  const clientId = env.JAMENDO_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({ error: 'Music provider is not configured' });
  }

  try {
    params.set('client_id', clientId);
    params.set('format', 'json');
    params.set('audioformat', 'mp32');
    const response = await fetch(`https://api.jamendo.com/v3.0/tracks/?${params}`);
    if (!response.ok) {
      return res.status(502).json({ error: 'Music provider request failed' });
    }

    const data = await response.json();
    if (data.headers?.status !== 'success') {
      return res.status(502).json({
        error: data.headers?.error_message || 'Music provider error',
      });
    }

    return res.json((data.results || []).map(toJamendoTrack));
  } catch (error) {
    console.error('Jamendo request failed:', error);
    return res.status(502).json({ error: 'Unable to fetch songs' });
  }
};

app.get('/api/music/search', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!query) {
    return res.status(400).json({ error: 'Please enter a song name' });
  }

  const params = new URLSearchParams({
    limit: String(parseLimit(req.query.limit)),
    search: query,
    include: 'licenses musicinfo',
  });

  return sendJamendoTracks(res, params);
});

app.get('/api/music/recommendations', async (req, res) => {
  const params = new URLSearchParams({
    limit: String(parseLimit(req.query.limit)),
    order: 'popularity_week',
  });

  return sendJamendoTracks(res, params);
});

const port = Number(env.PORT) || 5001;
app.listen(port, () => {
  console.log(`Signify API running on port ${port}`);
});
