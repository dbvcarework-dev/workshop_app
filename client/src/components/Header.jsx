import React from 'react';

const SearchIcon = () => (
  <svg color='#0284c7' width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

export default function Header({
  selectedFolder,
  selectedMsn,
  searchQuery,
  onSearchChange,
  onRefresh,
  loading
}) {
  return (
    <header className="explorer-header">
      {/* Brand & Logo */}
      <div className="brand-section">
        <div className="brand-icon">
          <img style={{ width: '30px', height: '30px', mixBlendMode: 'multiply' }} src="\logo.jpg" alt="" />
        </div>
        <div>
          <h1 className="brand-title">Document Explorer</h1>
          <div className="breadcrumb-trail">
            <span>Projects</span>
            {selectedFolder && (
              <>
                <span>/</span>
                <span className="breadcrumb-item">{selectedFolder.Name}</span>
              </>
            )}
            {selectedMsn && (
              <>
                <span>/</span>
                <span className="breadcrumb-active">MSN: {selectedMsn}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Header Actions: Search & Refresh */}
      <div className="header-actions">
        <div className="search-box">
         <div className='search-icon'>
           <SearchIcon />
         </div>
          <input
            type="text"
            className="search-input"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="refresh-btn"
          title="Refresh SharePoint Projects"
        >
         
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    </header>
  );
}
