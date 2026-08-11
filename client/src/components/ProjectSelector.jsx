import React from 'react';
import CustomDropdown from './CustomDropdown.jsx';

export default function ProjectSelector({
  folders,
  selectedFolder,
  onSelectFolder,
  groupedByMsn,
  selectedMsn,
  onSelectMsn,
  searchQuery
}) {
  const msnKeys = Object.keys(groupedByMsn)

  return (
    <aside className="sidebar-panel">
      {/* Step 1: Custom Project Dropdown */}
      <div className="panel-header">
        <div className="panel-title">1. Select Project Folder</div>
        <CustomDropdown
          folders={folders}
          selectedFolder={selectedFolder}
          onSelectFolder={onSelectFolder}
        />
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
