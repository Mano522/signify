const ARCHIVE_ADVANCED_SEARCH_URL = 'https://archive.org/advancedsearch.php';
const ARCHIVE_METADATA_URL = 'https://archive.org/metadata';
const ARCHIVE_DOWNLOAD_BASE_URL = 'https://archive.org/download';
const DEFAULT_RECOMMENDED_LIMIT = 160;
const DEFAULT_SEARCH_LIMIT = 220;
const ARCHIVE_PAGE_SIZE = 50;

const BASE_AUDIO_FILTER = [
  'mediatype:audio',
  '(collection:opensource_audio OR collection:etree)',
  '(format:"VBR MP3" OR format:MP3 OR format:"Ogg Vorbis" OR format:FLAC OR format:WAV OR format:AAC OR format:MPEG4)',
].join(' AND ');

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
};

const parseDurationToSeconds = (value) => {
  if (!value) return 0;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  }

  const raw = String(value).trim();
  if (!raw) return 0;

  if (/^\d+(\.\d+)?$/.test(raw)) {
    return Math.max(0, Math.round(Number(raw)));
  }

  const parts = raw.split(':').map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return 0;

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return 0;
};

const encodeFilePath = (fileName) =>
  String(fileName)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const pickPlayableFile = (files) => {
  if (!Array.isArray(files)) return null;

  const playable = files.filter((file) => {
    const name = String(file?.name || '').toLowerCase();
    const format = String(file?.format || '').toLowerCase();

    const isAudioFormat =
      format.includes('mp3') ||
      format.includes('ogg') ||
      format.includes('vorbis') ||
      format.includes('flac') ||
      format.includes('wav') ||
      format.includes('aac') ||
      format.includes('m4a') ||
      format.includes('mpeg4');

    const isAudioExtension =
      name.endsWith('.mp3') ||
      name.endsWith('.ogg') ||
      name.endsWith('.oga') ||
      name.endsWith('.flac') ||
      name.endsWith('.wav') ||
      name.endsWith('.m4a') ||
      name.endsWith('.aac');

    return Boolean(name) && (isAudioFormat || isAudioExtension);
  });

  return playable[0] || null;
};

const getCreator = (metadata, file) => {
  const fileCreator = file?.creator;
  if (fileCreator) return String(fileCreator);

  const creator = metadata?.creator;
  if (Array.isArray(creator)) return String(creator[0] || 'Archive Artist');
  if (creator) return String(creator);

  return 'Archive Artist';
};

const toArchiveSong = (identifier, metadata, file, index = 0) => {
  if (!file?.name) return null;

  const title =
    file.title ||
    metadata?.title ||
    file.name.replace(/\.[a-z0-9]+$/i, '') ||
    `Archive Track ${index + 1}`;

  const artist = getCreator(metadata, file);
  const duration = parseDurationToSeconds(file.length || file.duration || metadata?.length);
  const filePath = encodeFilePath(file.name);

  return {
    id: `archive_${identifier}_${file.name}`,
    title: String(title),
    artist,
    mood: 'Archive',
    language: 'Global',
    url: `${ARCHIVE_DOWNLOAD_BASE_URL}/${identifier}/${filePath}`,
    duration,
    artworkUrl: `https://archive.org/services/img/${identifier}`,
    collectionName: metadata?.collection ? toArray(metadata.collection).join(', ') : 'Internet Archive',
    source: 'archive',
  };
};

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Archive request failed: ${response.status}`);
  }
  return response.json();
};

const buildSearchQuery = (query) => {
  if (!query?.trim()) return BASE_AUDIO_FILTER;

  const safe = query.trim().replace(/"/g, '');
  return `${BASE_AUDIO_FILTER} AND (${safe})`;
};

const fetchArchiveDocsPage = async (query, rows = ARCHIVE_PAGE_SIZE, page = 1) => {
  const params = new URLSearchParams();
  params.set('q', buildSearchQuery(query));
  params.set('fl[]', 'identifier');
  params.set('fl[]', 'title');
  params.set('fl[]', 'creator');
  params.set('rows', String(rows));
  params.set('page', String(page));
  params.set('output', 'json');
  params.set('sort[]', query?.trim() ? 'downloads desc' : 'week desc');

  const url = `${ARCHIVE_ADVANCED_SEARCH_URL}?${params.toString()}`;
  const json = await fetchJson(url);
  return Array.isArray(json?.response?.docs) ? json.response.docs : [];
};

const dedupeDocs = (docs) => {
  const seen = new Set();
  const unique = [];

  docs.forEach((doc) => {
    const identifier = String(doc?.identifier || '');
    if (!identifier || seen.has(identifier)) return;
    seen.add(identifier);
    unique.push(doc);
  });

  return unique;
};

const fetchArchiveDocs = async (query, target = DEFAULT_SEARCH_LIMIT) => {
  const limit = Math.max(1, Number(target || 0));
  const pages = Math.max(1, Math.ceil(limit / ARCHIVE_PAGE_SIZE));
  const requests = [];

  for (let page = 1; page <= pages; page += 1) {
    requests.push(fetchArchiveDocsPage(query, ARCHIVE_PAGE_SIZE, page));
  }

  const chunks = await Promise.all(requests);
  return dedupeDocs(chunks.flat()).slice(0, limit);
};

const fetchSongFromDoc = async (doc, index = 0) => {
  const identifier = doc?.identifier;
  if (!identifier) return null;

  try {
    const metadataUrl = `${ARCHIVE_METADATA_URL}/${encodeURIComponent(identifier)}`;
    const metadataJson = await fetchJson(metadataUrl);
    const metadata = metadataJson?.metadata || {};
    const file = pickPlayableFile(metadataJson?.files);
    return toArchiveSong(identifier, metadata, file, index);
  } catch (error) {
    console.error('Error resolving archive song:', identifier, error);
    return null;
  }
};

const mapDocsToSongs = async (docs, limit = DEFAULT_SEARCH_LIMIT) => {
  const slice = docs.slice(0, Math.max(limit * 2, limit));
  const resolved = await Promise.all(slice.map((doc, index) => fetchSongFromDoc(doc, index)));

  return resolved
    .filter((song) => Boolean(song?.url))
    .slice(0, limit);
};

export const fetchRecommendedArchiveSongs = async (limit = DEFAULT_RECOMMENDED_LIMIT) => {
  try {
    const docs = await fetchArchiveDocs('', Math.max(limit * 2, limit));
    return mapDocsToSongs(docs, limit);
  } catch (error) {
    console.error('Error fetching archive recommended songs:', error);
    return [];
  }
};

export const searchArchiveSongs = async (query, limit = DEFAULT_SEARCH_LIMIT) => {
  if (!query?.trim()) return fetchRecommendedArchiveSongs(limit);

  try {
    const docs = await fetchArchiveDocs(query, Math.max(limit * 2, limit));
    return mapDocsToSongs(docs, limit);
  } catch (error) {
    console.error('Error searching archive songs:', error);
    return [];
  }
};
