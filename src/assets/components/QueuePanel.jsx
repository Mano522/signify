/**
 * Up Next Queue Panel
 * Features:
 * - Slide-out drawer / modal showing upcoming tracks
 * - Drag-to-reorder (HTML5 native Drag & Drop)
 * - "Radio from this song" button (seeds recommendation engine)
 * - Direct track selection & removal
 */

import React, { useState } from 'react';
import './QueuePanel.css';

const QueuePanel = ({
  isOpen,
  onClose,
  currentSong,
  queue = [],
  onReorderQueue,
  onPlayQueueItem,
  onRemoveFromQueue,
  onStartRadio,
}) => {
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  if (!isOpen) return null;

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Transparent or text data for browser compatibility
    e.dataTransfer.setData('text/plain', index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const updatedQueue = [...queue];
    const [movedItem] = updatedQueue.splice(draggedIndex, 1);
    updatedQueue.splice(targetIndex, 0, movedItem);

    onReorderQueue(updatedQueue);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <>
      <div className="queue-backdrop" onClick={onClose} />
      <div className="queue-panel glass">
        <div className="queue-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.4rem' }}>📑</span>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#7C3AED' }}>
              Up Next ({queue.length})
            </h3>
          </div>
          <button className="queue-close-btn" onClick={onClose} title="Close queue">
            ✕
          </button>
        </div>

        {/* Currently Playing Card */}
        {currentSong && (
          <div className="queue-now-playing">
            <span className="queue-badge">NOW PLAYING</span>
            <div className="queue-item current">
              {currentSong.artworkUrl && (
                <img src={currentSong.artworkUrl} alt="" className="queue-thumb" />
              )}
              <div className="queue-item-info">
                <span className="queue-title">{currentSong.title}</span>
                <span className="queue-artist">{currentSong.artist}</span>
              </div>
              <button
                className="radio-btn"
                title="Radio from this song"
                onClick={() => onStartRadio?.(currentSong)}
              >
                📻 Radio
              </button>
            </div>
          </div>
        )}

        {/* Up Next List with Drag & Drop */}
        <div className="queue-list">
          {queue.length === 0 ? (
            <div className="queue-empty">
              <span>🎵</span>
              <p>Queue is empty. Select a song or mood to start auto-recommendations!</p>
            </div>
          ) : (
            queue.map((song, index) => {
              const isDragging = draggedIndex === index;
              const isOver = dragOverIndex === index;

              return (
                <div
                  key={`${song.id || song.title}_${index}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, index)}
                  className={`queue-item draggable ${isDragging ? 'dragging' : ''} ${isOver ? 'drag-over' : ''}`}
                  onClick={() => onPlayQueueItem(song, index)}
                >
                  <div className="drag-handle" title="Drag to reorder">
                    ⋮⋮
                  </div>
                  <span className="queue-index">{index + 1}</span>

                  {song.artworkUrl ? (
                    <img src={song.artworkUrl} alt="" className="queue-thumb" />
                  ) : (
                    <div className="queue-thumb-placeholder">🎵</div>
                  )}

                  <div className="queue-item-info">
                    <span className="queue-title">{song.title}</span>
                    <span className="queue-artist">{song.artist}</span>
                  </div>

                  <div className="queue-item-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="radio-btn-mini"
                      title="Radio from this song"
                      onClick={() => onStartRadio?.(song)}
                    >
                      📻
                    </button>
                    <button
                      className="queue-remove-btn"
                      title="Remove from queue"
                      onClick={() => onRemoveFromQueue(index)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
};

export default QueuePanel;
