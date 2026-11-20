import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { env } from 'node:process';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/music/search', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  if (!query) {
    return res.status(400).json({ error: 'Please enter a song name' });
  }

  const clientId = env.JAMENDO_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({ error: 'Music provider is not configured' });
  }

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      format: 'json',
      limit: '20',
      search: query,
      include: 'licenses musicinfo',
      audioformat: 'mp32',
    });

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

    const tracks = (data.results || []).map((track) => ({
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
    }));

    return res.json(tracks);
  } catch (error) {
    console.error('Jamendo search failed:', error);
    return res.status(502).json({ error: 'Unable to fetch songs' });
  }
});

const port = Number(env.PORT) || 5000;
app.listen(port, () => {
  console.log(`Signify API running on port ${port}`);
});
