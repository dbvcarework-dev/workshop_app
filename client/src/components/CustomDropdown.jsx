import React, { useState, useRef, useEffect } from 'react';

// Outline SVG Icons (No Emojis)
const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
  </svg>
);

const ChevronDownIcon = ({ isOpen }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      flexShrink: 0,
      transition: 'transform 0.2s ease',
      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)'
    }}
  >
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

const SearchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--accent-primary)' }}>
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

export default function CustomDropdown({ folders = [], selectedFolder, onSelectFolder }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);

  // Filtered list based on search query
  const filteredFolders = folders.filter(f =>
    f.Name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset search & focus input when opening
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setHighlightedIndex(-1);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Update highlighted index when selectedFolder changes
  useEffect(() => {
    if (selectedFolder) {
      const idx = filteredFolders.findIndex(f => f.ServerRelativeUrl === selectedFolder.ServerRelativeUrl);
      if (idx !== -1) setHighlightedIndex(idx);
    }
  }, [selectedFolder, folders]);

  // Handle keyboard navigation (operates on filteredFolders)
  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % filteredFolders.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + filteredFolders.length) % filteredFolders.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredFolders.length) {
        onSelectFolder(filteredFolders[highlightedIndex].ServerRelativeUrl);
        setIsOpen(false);
      }
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current && highlightedIndex >= 0) {
      const itemEl = listRef.current.children[highlightedIndex];
      if (itemEl) {
        itemEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  return (
    <div
      className="custom-dropdown-container"
      ref={dropdownRef}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="combobox"
      aria-expanded={isOpen}
      aria-haspopup="listbox"
    >
      {/* Trigger: Closed state */}
      <button
        type="button"
        className={`dropdown-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="trigger-content">
          <FolderIcon />
          <span className="trigger-label">
            {selectedFolder ? selectedFolder.Name : (folders.length > 0 ? 'Select a project...' : 'No projects found')}
          </span>
        </div>
        <ChevronDownIcon isOpen={isOpen} />
      </button>

      {/* Popover list */}
      {isOpen && (
        <div className="dropdown-popover" role="listbox">
          {/* Search input */}
          <div className="dropdown-search-wrapper">
            <SearchIcon />
            <input
              ref={searchRef}
              type="text"
              className="dropdown-search-input"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setHighlightedIndex(-1);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Items */}
          <div ref={listRef}>
            {filteredFolders.length === 0 ? (
              <div className="dropdown-empty-item">
                {folders.length === 0 ? 'No project folders found' : 'No projects match your search'}
              </div>
            ) : (
              filteredFolders.map((folder, index) => {
                const isSelected = selectedFolder && selectedFolder.ServerRelativeUrl === folder.ServerRelativeUrl;
                const isHighlighted = index === highlightedIndex;
                const itemCount = folder.ItemCount || 0;
                const isEmpty = itemCount === 0;

                return (
                  <div
                    key={folder.ServerRelativeUrl}
                    role="option"
                    aria-selected={isSelected}
                    className={`dropdown-row-item ${isSelected ? 'selected' : ''} ${isHighlighted ? 'highlighted' : ''} ${isEmpty ? 'empty' : ''}`}
                    onClick={() => {
                      onSelectFolder(folder.ServerRelativeUrl);
                      setIsOpen(false);
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <FolderIcon />
                    <span className="row-name">{folder.Name}</span>
                    <span className={`row-badge ${isEmpty ? 'empty' : ''}`}>
                      {isEmpty ? 'Empty' : `${itemCount} items`}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
