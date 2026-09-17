import React, { useState, useRef } from 'react';

// Use current host so uploads target the backend on the server machine
const apiBase = `${window.location.protocol}//${window.location.hostname}:5000`;

const DOC_TYPE_OPTIONS = [
  'DRAWINGS (DWG)',
  'TECHNICAL DELIVERY CONDITION (TDC)',
  'DESIGN CHANGE REQUEST (DCR)',
  'REVISION CHANGE LOG (RCL)',
];

const todayISO = () => new Date().toISOString().split('T')[0];

export default function DocumentUploadModal({ selectedMsn, selectedFolder, minIssueDate, onClose, onUploadSuccess }) {
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [docNumber, setDocNumber] = useState('');
  const [docType, setDocType] = useState('');
  const [revisionNumber, setRevisionNumber] = useState('');
  const [description, setDescription] = useState('');
  const [issueDate, setIssueDate] = useState(todayISO());
  const [queue, setQueue] = useState([]); // documents already added, waiting to be uploaded
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // { current, total }
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  const handleFileChange = (e) => {
    if (e.target.files[0]) setFile(e.target.files[0]);
  };

  const handleRemoveFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const fileToBase64 = (fileToConvert) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(fileToConvert);
      reader.onload = () => {
        const resultStr = reader.result || '';
        const base64String = resultStr.includes(',') ? resultStr.split(',')[1] : resultStr;
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  // Can't back-date before the MSN's latest issue, since DIN columns run chronologically.
  // No prior issue means no lower bound; a stray future date in the data clamps to today so
  // the picker can't end up with min > max.
  const earliestSelectable = !minIssueDate
    ? undefined
    : (minIssueDate < todayISO() ? minIssueDate : todayISO());

  const isEntryValid = file && docNumber.trim() && docType && revisionNumber.trim() && description.trim()
    && issueDate && issueDate <= todayISO()
    && (!earliestSelectable || issueDate >= earliestSelectable);

  const resetEntryFields = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setDocNumber('');
    setDocType('');
    setRevisionNumber('');
    setDescription('');
    setIssueDate(todayISO());
  };

  const handleAddAnother = () => {
    if (!isEntryValid) return;
    setQueue((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, file, docNumber, docType, revisionNumber, description, issueDate },
    ]);
    resetEntryFields();
  };

  const handleRemoveQueued = (id) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const uploadOneDocument = async (doc) => {
    const base64Data = await fileToBase64(doc.file);

    const response = await fetch(`${apiBase}/api/upload-document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folderUrl: selectedFolder?.ServerRelativeUrl,
        fileName: doc.file.name,
        fileDataBase64: base64Data,
        docNumber: doc.docNumber,
        docType: doc.docType,
        revisionNumber: doc.revisionNumber,
        description: doc.description,
        issueDate: doc.issueDate,
        msnNumber: selectedMsn
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${response.status}`);
    }

    return response.json();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (uploading) return;

    // Include the currently-filled-in entry (if valid) without forcing the user to click "Add Another" first
    const documentsToUpload = isEntryValid
      ? [...queue, { id: 'current', file, docNumber, docType, revisionNumber, description, issueDate }]
      : queue;

    if (documentsToUpload.length === 0) return;

    setUploading(true);
    setUploadError(null);

    try {
      for (let i = 0; i < documentsToUpload.length; i++) {
        setUploadProgress({ current: i + 1, total: documentsToUpload.length });
        const doc = documentsToUpload[i];
        const result = await uploadOneDocument(doc);
        console.log(`✅ Document ${i + 1}/${documentsToUpload.length} upload successful:`, result);
      }

      if (onUploadSuccess) {
        await onUploadSuccess();
      }
      onClose();
    } catch (err) {
      console.error('❌ Upload Error:', err);
      setUploadError(err.message || 'Failed to upload document');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const totalDocumentCount = queue.length + (isEntryValid ? 1 : 0);
  const canSubmit = totalDocumentCount > 0 && !uploading;

  const dropZoneClass = [
    'modal-dropzone',
    dragOver ? 'drag-over' : '',
    file ? 'has-file' : '',
  ].filter(Boolean).join(' ');

  const fileSize = file
    ? file.size < 1024 * 1024
      ? (file.size / 1024).toFixed(1) + ' KB'
      : (file.size / (1024 * 1024)).toFixed(1) + ' MB'
    : '';

  return (
    <>
      {/* Backdrop */}
      <div className="modal-backdrop" onClick={!uploading ? onClose : undefined} />

      {/* Modal */}
      <div
        className="modal-container modal-container-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-modal-title"
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <div className="modal-header-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div>
              <div id="upload-modal-title" className="modal-header-title">Add Document</div>
              <div className="modal-header-sub">Upload one or more documents to SharePoint</div>
            </div>
          </div>

          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={uploading}
            aria-label="Close modal"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="modal-body modal-body-landscape">

            {/* Error Alert */}
            {uploadError && (
              <div className="error-alert" style={{ marginBottom: 0 }}>
                <p style={{ margin: '0 0 4px 0', fontWeight: '600' }}>⚠️ Upload Failed</p>
                <p style={{ margin: 0, fontSize: '13px' }}>{uploadError}</p>
              </div>
            )}

            {/* Destination Read-Only Fields */}
            <div className="modal-readonly-row">
              <div className="modal-readonly-field">
                <label className="modal-field-label">Project Folder</label>
                <div className="modal-readonly-value">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="modal-readonly-text">{selectedFolder?.Name ?? '—'}</span>
                </div>
              </div>
              <div className="modal-readonly-field">
                <label className="modal-field-label">MSN Number</label>
                <div className="modal-readonly-value">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                  <span className="modal-readonly-text">{selectedMsn ?? '—'}</span>
                </div>
              </div>
            </div>

            {/* Two-column layout: form fields on the left, queued documents on the right */}
            <div className="modal-columns">
              {/* Left column: entry form */}
              <div className="modal-column-left">
                {/* Drop Zone */}
                <div
                  className={dropZoneClass}
                  onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { if (!uploading) handleDrop(e); }}
                  onClick={() => !file && !uploading && fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileChange}
                    disabled={uploading}
                    style={{ display: 'none' }}
                    aria-label="File input"
                  />

                  {file ? (
                    <div className="modal-file-preview">
                      <div className="modal-file-preview-info">
                        <div className="modal-file-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="modal-file-name">{file.name}</div>
                          <div className="modal-file-size">{fileSize}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="refresh-btn"
                        onClick={handleRemoveFile}
                        disabled={uploading}
                        style={{ flexShrink: 0, padding: '4px 10px', fontSize: '12px' }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="modal-dropzone-prompt-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                      </div>
                      <div className="modal-dropzone-prompt-title">
                        Drop file here or <span>browse</span>
                      </div>
                      <div className="modal-dropzone-prompt-sub">PDF, DOCX, XLSX, DWG and more</div>
                    </>
                  )}
                </div>

                {/* Document Number */}
                <div>
                  <label className="modal-field-label">
                    Document Number <span>*</span>
                  </label>
                  <input
                    type="text"
                    className="modal-input"
                    value={docNumber}
                    onChange={(e) => setDocNumber(e.target.value)}
                    placeholder="e.g. DOC-2025-001"
                    disabled={uploading}
                  />
                </div>

                {/* Document Type */}
                <div>
                  <label className="modal-field-label">
                    Document Type <span>*</span>
                  </label>
                  <select
                    className={`modal-select${docType ? '' : ' placeholder'}`}
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    disabled={uploading}
                  >
                    <option value="" disabled>Select a type...</option>
                    {DOC_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Revision Number */}
                <div>
                  <label className="modal-field-label">
                    Revision Number <span>*</span>
                  </label>
                  <input
                    type="text"
                    className="modal-input"
                    value={revisionNumber}
                    onChange={(e) => setRevisionNumber(e.target.value)}
                    placeholder="e.g. R0, R1, R2.."
                    disabled={uploading}
                  />
                </div>

                {/* Document / Drawing Description */}
                <div>
                  <label className="modal-field-label">
                    Document / Drawing Description <span>*</span>
                  </label>
                  <input
                    type="text"
                    className="modal-input"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Assembly drawing for main frame"
                    disabled={uploading}
                  />
                </div>

                {/* Issue Date */}
                <div>
                  <label className="modal-field-label">
                    Issue Date <span>*</span>
                  </label>
                  <input
                    type="date"
                    className="modal-input"
                    value={issueDate}
                    min={earliestSelectable}
                    max={todayISO()}
                    onChange={(e) => setIssueDate(e.target.value)}
                    disabled={uploading}
                  />
                  {minIssueDate && minIssueDate < todayISO() && (
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Latest issue for this MSN is {minIssueDate} — earlier dates can't be selected.
                    </div>
                  )}
                </div>

                {/* Add Another Document */}
                <button
                  type="button"
                  className="refresh-btn"
                  onClick={handleAddAnother}
                  disabled={!isEntryValid || uploading}
                  style={{ alignSelf: 'flex-start' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Add Another Document</span>
                </button>
              </div>

              {/* Right column: queued documents */}
              <div className="modal-column-right">
                <label className="modal-field-label">
                  Documents Ready to Upload ({queue.length})
                </label>
                {queue.length === 0 ? (
                  <div className="modal-column-right-empty">
                    No documents added yet.<br />Fill the form and click "Add Another Document" to queue more than one, or leave it as-is and just click Upload for a single document.
                  </div>
                ) : (
                  <div className="modal-queue-list">
                    {queue.map((doc) => (
                      <div key={doc.id} className="modal-queue-item">
                        <div style={{ minWidth: 0 }}>
                          <div className="modal-queue-item-name">
                            {doc.file.name}
                          </div>
                          <div className="modal-queue-item-meta">
                            {doc.docNumber} · {doc.docType} · {doc.revisionNumber} · {doc.issueDate}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="refresh-btn"
                          onClick={() => handleRemoveQueued(doc.id)}
                          disabled={uploading}
                          style={{ flexShrink: 0, padding: '4px 10px', fontSize: '12px' }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button type="button" className="refresh-btn" onClick={onClose} disabled={uploading}>
              Cancel
            </button>
            <button
              type="submit"
              className="generate-din-btn modal-submit-btn"
              disabled={!canSubmit}
            >
              {uploading ? (
                <>
                  <div
                    style={{
                      width: '14px',
                      height: '14px',
                      border: '2px solid rgba(255,255,255,0.4)',
                      borderTopColor: '#ffffff',
                      borderRadius: '50%',
                      animation: 'spin 0.6s linear infinite',
                    }}
                  />
                  <span>
                    {uploadProgress ? `Uploading ${uploadProgress.current} of ${uploadProgress.total}...` : 'Uploading...'}
                  </span>
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span>{totalDocumentCount > 1 ? `Upload ${totalDocumentCount} Documents` : 'Upload Document'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
