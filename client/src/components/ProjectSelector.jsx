import React from 'react';
import CustomDropdown from './CustomDropdown.jsx';

export default function ProjectSelector({
  folders,
  selectedFolder,
  onSelectFolder,
  groupedByMsn,
  selectedMsn,
  onSelectMsn,
  searchQuery,
  isCollapsed,
  onToggleCollapse
}) {
  const msnKeys = Object.keys(groupedByMsn)

  // Collapsed: a slim strip with just the expand arrow, so the PDF viewer (flex: 1
  // on the content panel) reclaims the freed width automatically — no dead space.
  if (isCollapsed) {
    return (
      <aside className="sidebar-panel collapsed">
        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={onToggleCollapse}
          title="Expand project/MSN panel"
          aria-label="Expand project/MSN panel"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <aside className="sidebar-panel">
      {/* Step 1: Custom Project Dropdown */}
      <div className="panel-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="panel-title">1. Select Project Folder</div>
          <CustomDropdown
            folders={folders}
            selectedFolder={selectedFolder}
            onSelectFolder={onSelectFolder}
          />
        </div>
        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={onToggleCollapse}
          title="Collapse panel to make the PDF viewer bigger"
          aria-label="Collapse panel"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
      </div>

      {/* Step 2: MSN Explorer List */}
      <div className="msn-nav-section">
        <div className="panel-title" style={{ padding: '4px 6px' }}>
          2. Select MSN Number ({msnKeys.length})
        </div>

        {msnKeys.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '12px 6px', fontStyle: 'italic' }}>
            No MSN numbers match.
          </p>
        ) : (
          msnKeys.map((msn) => {
            const count = groupedByMsn[msn]?.length || 0;
            const isSelected = selectedMsn === msn;
            return (
              <div
                key={msn}
                className={`msn-nav-item ${isSelected ? 'active' : ''}`}
                onClick={() => onSelectMsn(msn)}
              >
                <div className="msn-nav-label">
                  <span>MSN: {msn}</span>
                </div>
                <span className="msn-nav-badge">{count} file(s)</span>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
