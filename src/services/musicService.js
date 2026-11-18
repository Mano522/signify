export const searchExactSong = async (artist, title) => {
  const trySearch = async (query) => {
    try {
      const encodedQuery = encodeURIComponent(query);
      // Added country=IN for better regional matching
      const url = `https://itunes.apple.com/search?term=${encodedQuery}&limit=1&entity=song&country=IN`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        return {
          previewUrl: result.previewUrl,
          artworkUrl: result.artworkUrl100,
          duration: result.trackTimeMillis / 1000,
          collectionName: result.collectionName
        };
      }
      return null;
    } catch (error) {
      console.error(`Error searching iTunes for ${query}:`, error);
      return null;
    }
  };

  // 1st Attempt: Artist + Title
  let result = await trySearch(`${artist} ${title}`);
  if (result) return result;

  // 2nd Attempt: Just Title (sometimes artist name varies in regional music listings)
  result = await trySearch(title);
  if (result) return result;

  // 3rd Attempt: Cleaned Title (remove common movie suffixes like "(Official Video)", "(Lyrics)", etc.)
  const cleanTitle = title.replace(/\(.*\)|\[.*\]/g, "").trim();
  if (cleanTitle !== title) {
    result = await trySearch(cleanTitle);
  }

  return result;
};
