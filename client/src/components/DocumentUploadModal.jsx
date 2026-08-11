import React, { useState, useRef } from 'react';

const DOC_TYPE_OPTIONS = [
  'DRAWINGS (DWG)',
  'TECHNICAL DELIEVRY CONDITION (TDC)',
  'DEISGN CHANGE REQUEST (DCR)',
  'REVISION CHANGE LOG (RCL)',
];

export default function DocumentUploadModal({ selectedMsn, selectedFolder, onClose, onUploadSuccess }) {
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [docNumber, setDocNumber] = useState('');
  const [docType, setDocType] = useState('');
  const [revisionNumber, setRevisionNumber] = useState('');
  const [uploading, setUploading] = useState(false);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || uploading) return;

    setUploading(true);
    setUploadError(null);

    try {
      const base64Data = await fileToBase64(file);

      const response = await fetch('http://localhost:5000/api/upload-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderUrl: selectedFolder?.ServerRelativeUrl,
          fileName: file.name,
          fileDataBase64: base64Data,
          docNumber: docNumber,
          docType: docType,
          revisionNumber: revisionNumber,
          msnNumber: selectedMsn
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Document upload successful:', result);

      if (onUploadSuccess) {
        await onUploadSuccess();
      }
      onClose();
    } catch (err) {
      console.error('❌ Upload Error:', err);
      setUploadError(err.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const canSubmit = file && docNumber.trim() && docType && revisionNumber.trim() && !uploading;

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
        className="modal-container"
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
              <div className="modal-header-sub">Upload a document to SharePoint</div>
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
          <div className="modal-body">

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
                required
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
                required
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
                required
              />
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
              disabled={!canSubmit || uploading}
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
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span>Upload Document</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
