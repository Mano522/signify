import React, { useMemo, useState } from 'react';
import {
  getFavorites,
  getPlaylists,
  createPlaylist,
  deletePlaylist,
  removeFromPlaylist,
} from '../../services/playlistService';
import './Sidebar.css';

const Sidebar = ({ isOpen, onClose, onPlaySong, currentSong, onLibraryChange }) => {
  const [activeTab, setActiveTab] = useState('favorites');
  const [expandedPlaylist, setExpandedPlaylist] = useState(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [libraryVersion, setLibraryVersion] = useState(0);

  const favorites = useMemo(() => {
    if (!isOpen || libraryVersion < 0) return [];
    return getFavorites();
  }, [isOpen, libraryVersion]);

  const playlists = useMemo(() => {
    if (!isOpen || libraryVersion < 0) return [];
    return getPlaylists();
  }, [isOpen, libraryVersion]);

  const refreshLibrary = () => setLibraryVersion((v) => v + 1);

  const handleCreatePlaylist = () => {
    if (!newPlaylistName.trim()) return;
    createPlaylist(newPlaylistName.trim());
    refreshLibrary();
    onLibraryChange?.();
    setNewPlaylistName('');
    setShowCreateForm(false);
  };

  const handleDeletePlaylist = (e, playlistId) => {
    e.stopPropagation();
    deletePlaylist(playlistId);
    refreshLibrary();
    onLibraryChange?.();
    if (expandedPlaylist === playlistId) setExpandedPlaylist(null);
  };

  const handleRemoveFromPlaylist = (e, playlistId, songId) => {
    e.stopPropagation();
    removeFromPlaylist(playlistId, songId);
    refreshLibrary();
    onLibraryChange?.();
  };

  return (
    <>
      {/* Backdrop */}
      <div className={`sidebar-backdrop ${isOpen ? 'visible' : ''}`} onClick={onClose} />

      {/* Panel */}
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2 className="sidebar-title">🎵 Library</h2>
          <button className="sidebar-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab ${activeTab === 'favorites' ? 'active' : ''}`}
            onClick={() => setActiveTab('favorites')}
          >
            ❤️ Favorites
          </button>
          <button
            className={`sidebar-tab ${activeTab === 'playlists' ? 'active' : ''}`}
            onClick={() => setActiveTab('playlists')}
          >
            📂 Playlists
          </button>
        </div>

        <div className="sidebar-content">
          {/* FAVORITES TAB */}
          {activeTab === 'favorites' && (
            <div className="sidebar-list">
              {favorites.length === 0 ? (
                <div className="sidebar-empty">
                  <span>💔</span>
                  <p>No favorites yet. Click ❤ on a song to save it here.</p>
                </div>
              ) : (
                favorites.map((song) => (
                  <div
                    key={song.id}
                    className={`sidebar-song-item ${currentSong?.id === song.id ? 'playing' : ''}`}
                    onClick={() => onPlaySong(song)}
                  >
                    <div className="sidebar-song-info">
                      <span className="sidebar-song-title">{song.title}</span>
                      <span className="sidebar-song-artist">{song.artist}</span>
                    </div>
                    {currentSong?.id === song.id && <span className="sidebar-now-playing-dot">▶</span>}
                  </div>
                ))
              )}
            </div>
          )}

          {/* PLAYLISTS TAB */}
          {activeTab === 'playlists' && (
            <div className="sidebar-list">
              <button className="create-playlist-btn" onClick={() => setShowCreateForm(!showCreateForm)}>
                + New Playlist
              </button>

              {showCreateForm && (
                <div className="create-playlist-form">
                  <input
                    type="text"
                    placeholder="Playlist name..."
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
                    autoFocus
                  />
                  <button onClick={handleCreatePlaylist}>Create</button>
                </div>
              )}

              {playlists.length === 0 ? (
                <div className="sidebar-empty">
                  <span>📭</span>
                  <p>No playlists yet. Create one above!</p>
                </div>
              ) : (
                playlists.map((pl) => (
                  <div key={pl.id} className="playlist-group">
                    <div
                      className="playlist-header"
                      onClick={() => setExpandedPlaylist(expandedPlaylist === pl.id ? null : pl.id)}
                    >
                      <div className="playlist-header-left">
                        <span className="playlist-arrow">{expandedPlaylist === pl.id ? '▾' : '▸'}</span>
                        <span className="playlist-name">{pl.name}</span>
                        <span className="playlist-count">{pl.songs.length}</span>
                      </div>
                      <button
                        className="playlist-delete-btn"
                        onClick={(e) => handleDeletePlaylist(e, pl.id)}
                        title="Delete playlist"
                      >
                        🗑
                      </button>
                    </div>

                    {expandedPlaylist === pl.id && (
                      <div className="playlist-songs">
                        {pl.songs.length === 0 ? (
                          <p className="playlist-empty-msg">Add songs using ➕ on song cards.</p>
                        ) : (
                          pl.songs.map((song) => (
                            <div
                              key={song.id}
                              className={`sidebar-song-item ${currentSong?.id === song.id ? 'playing' : ''}`}
                              onClick={() => onPlaySong(song)}
                            >
                              <div className="sidebar-song-info">
                                <span className="sidebar-song-title">{song.title}</span>
                                <span className="sidebar-song-artist">{song.artist}</span>
                              </div>
                              <button
                                className="remove-from-playlist-btn"
                                onClick={(e) => handleRemoveFromPlaylist(e, pl.id, song.id)}
                                title="Remove from playlist"
                              >
                                ✕
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
