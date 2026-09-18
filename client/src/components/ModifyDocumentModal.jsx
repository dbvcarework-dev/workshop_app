import React, { useState } from 'react';

const apiBase = `${window.location.protocol}//${window.location.hostname}:5000`;

const DOC_TYPE_OPTIONS = [
  'DRAWINGS (DWG)',
  'TECHNICAL DELIVERY CONDITION (TDC)',
  'DESIGN CHANGE REQUEST (DCR)',
  'REVISION CHANGE LOG (RCL)',
];

const todayISO = () => new Date().toISOString().split('T')[0];

// TEMPORARY: mirrors the same backfill toggle in DocumentUploadModal.jsx.
// Set back to true once historical backfill is done, to restore the
// "can't be earlier than the MSN's latest issue" constraint.
const ENFORCE_MIN_ISSUE_DATE = false;

// A document's CustomDate comes back as an ISO-ish datetime string (or null);
// the date input needs a plain YYYY-MM-DD, defaulting to today when unset.
const toDateInputValue = (customDate) => (customDate ? String(customDate).slice(0, 10) : todayISO());

function buildEntryFromDoc(doc) {
  return {
    key: doc.ServerRelativeUrl || doc.Name,
    originalDoc: doc,
    file: null,
    docNumber: doc.DocNumber || '',
    docType: doc.DocType || '',
    revisionNumber: doc.RevisionNumber || '',
    description: doc.Description || '',
    issueDate: toDateInputValue(doc.CustomDate),
  };
}

function entryHasChanges(entry) {
  const d = entry.originalDoc;
  return Boolean(
    entry.file ||
    entry.docNumber !== (d.DocNumber || '') ||
    entry.docType !== (d.DocType || '') ||
    entry.revisionNumber !== (d.RevisionNumber || '') ||
    entry.description !== (d.Description || '') ||
    entry.issueDate !== toDateInputValue(d.CustomDate)
  );
}

export default function ModifyDocumentModal({ selectedMsn, selectedFolder, documents, minIssueDate, onClose, onUpdateSuccess }) {
  const [step, setStep] = useState('select'); // 'select' | 'edit'
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [entries, setEntries] = useState([]);
  const [updating, setUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(null);
  const [updateError, setUpdateError] = useState(null);
  const [doneCount, setDoneCount] = useState(null); // how many actually changed, after a successful submit

  const toggleSelected = (key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const goToEdit = () => {
    const selectedDocs = documents.filter((d) => selectedKeys.has(d.ServerRelativeUrl || d.Name));
    // Preserve in-progress edits for docs still selected; build fresh pre-filled
    // entries for newly-added ones; drop entries for docs that got deselected.
    setEntries((prevEntries) => {
      const prevByKey = new Map(prevEntries.map((e) => [e.key, e]));
      return selectedDocs.map((doc) => {
        const key = doc.ServerRelativeUrl || doc.Name;
        return prevByKey.get(key) || buildEntryFromDoc(doc);
      });
    });
    setStep('edit');
  };

  const updateEntry = (key, patch) => {
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
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

  // Mirrors DocumentUploadModal's temporary backfill toggle: while disabled, no lower
  // bound is enforced on the date picker (any past date selectable). If re-enabled,
  // this uses the same MSN-level "can't be earlier than the latest issue" rule.
  const earliestSelectable = !ENFORCE_MIN_ISSUE_DATE || !minIssueDate
    ? undefined
    : (minIssueDate < todayISO() ? minIssueDate : todayISO());

  const isEntryValid = (entry) =>
    entry.docNumber.trim() && entry.docType && entry.revisionNumber.trim() && entry.description.trim()
    && entry.issueDate && entry.issueDate <= todayISO()
    && (!earliestSelectable || entry.issueDate >= earliestSelectable);

  const allValid = entries.length > 0 && entries.every(isEntryValid);
  const changedCount = entries.filter(entryHasChanges).length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (updating || !allValid) return;

    const toSubmit = entries.filter(entryHasChanges);
    if (toSubmit.length === 0) {
      setUpdateError('No changes were made to any selected document.');
      return;
    }

    setUpdating(true);
    setUpdateError(null);
    setDoneCount(null);

    try {
      for (let i = 0; i < toSubmit.length; i++) {
        setUpdateProgress({ current: i + 1, total: toSubmit.length });
        const entry = toSubmit[i];
        const fileName = entry.originalDoc.Name; // always keep the original filename in place

        if (entry.file) {
          const base64Data = await fileToBase64(entry.file);
          const response = await fetch(`${apiBase}/api/upload-document`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              folderUrl: selectedFolder?.ServerRelativeUrl,
              fileName,
              fileDataBase64: base64Data,
              docNumber: entry.docNumber,
              docType: entry.docType,
              revisionNumber: entry.revisionNumber,
              description: entry.description,
              issueDate: entry.issueDate,
              msnNumber: selectedMsn,
            }),
          });
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${response.status}`);
          }
        } else {
          const response = await fetch(`${apiBase}/api/update-document-metadata`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              folderUrl: selectedFolder?.ServerRelativeUrl,
              fileName,
              docNumber: entry.docNumber,
              docType: entry.docType,
              revisionNumber: entry.revisionNumber,
              description: entry.description,
              issueDate: entry.issueDate,
              msnNumber: selectedMsn,
            }),
          });
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${response.status}`);
          }
        }
      }

      setDoneCount(toSubmit.length);
      if (onUpdateSuccess) {
        await onUpdateSuccess();
      }
    } catch (err) {
      console.error('❌ Modify Document Error:', err);
      setUpdateError(err.message || 'Failed to update document(s)');
    } finally {
      setUpdating(false);
      setUpdateProgress(null);
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={!updating ? onClose : undefined} />

      <div
        className="modal-container modal-container-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modify-modal-title"
      >
        <div className="modal-header">
          <div className="modal-header-left">
            <div className="modal-header-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <div>
              <div id="modify-modal-title" className="modal-header-title">Modify Existing Document</div>
              <div className="modal-header-sub">
                {step === 'select' ? `Select documents to modify for MSN ${selectedMsn}` : 'Update the fields you want changed — everything else stays as-is'}
              </div>
            </div>
          </div>

          <button type="button" className="modal-close-btn" onClick={onClose} disabled={updating} aria-label="Close modal">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {step === 'select' ? (
          <>
            <div className="modal-body">
              {documents.length === 0 ? (
                <div className="modal-column-right-empty">No documents found for this MSN.</div>
              ) : (
                <div className="modal-queue-list" style={{ flex: 'none', maxHeight: '50vh' }}>
                  {documents.map((doc) => {
                    const key = doc.ServerRelativeUrl || doc.Name;
                    const checked = selectedKeys.has(key);
                    return (
                      <label
                        key={key}
                        className="modal-queue-item"
                        style={{ cursor: 'pointer', alignItems: 'flex-start' }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelected(key)}
                          style={{ marginTop: '3px' }}
                        />
                        <div style={{ minWidth: 0, marginLeft: '8px' }}>
                          <div className="modal-queue-item-name">{doc.Name}</div>
                          <div className="modal-queue-item-meta">
                            {doc.DocNumber || '—'} · {doc.DocType || '—'} · {doc.RevisionNumber || '—'}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="refresh-btn" onClick={onClose}>Cancel</button>
              <button
                type="button"
                className="generate-din-btn modal-submit-btn"
                disabled={selectedKeys.size === 0}
                onClick={goToEdit}
              >
                <span>Continue with {selectedKeys.size} Document{selectedKeys.size === 1 ? '' : 's'}</span>
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body modal-body-landscape">
              {updateError && (
                <div className="error-alert" style={{ marginBottom: 0 }}>
                  <p style={{ margin: '0 0 4px 0', fontWeight: '600' }}>⚠️ Update Failed</p>
                  <p style={{ margin: 0, fontSize: '13px' }}>{updateError}</p>
                </div>
              )}

              {doneCount !== null ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                  padding: '24px 12px', textAlign: 'center'
                }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%',
                    backgroundColor: '#dcfce7', color: '#16a34a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-main)' }}>
                    {doneCount} document{doneCount === 1 ? '' : 's'} updated
                  </div>
                  {entries.length > doneCount && (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {entries.length - doneCount} of {entries.length} selected had no changes and were skipped.
                    </div>
                  )}
                </div>
              ) : (
                entries.map((entry) => (
                  <div
                    key={entry.key}
                    style={{
                      border: '0.5px solid var(--border-color)',
                      borderRadius: '10px',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-main)' }}>
                      {entry.originalDoc.Name}
                      {entryHasChanges(entry) && (
                        <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: '600', color: '#16a34a' }}>
                          • modified
                        </span>
                      )}
                    </div>

                    <div className="modal-columns">
                      <div className="modal-column-left" style={{ gap: '10px' }}>
                        <div>
                          <label className="modal-field-label">Document Number <span>*</span></label>
                          <input
                            type="text"
                            className="modal-input"
                            value={entry.docNumber}
                            onChange={(e) => updateEntry(entry.key, { docNumber: e.target.value })}
                            disabled={updating}
                          />
                        </div>
                        <div>
                          <label className="modal-field-label">Document Type <span>*</span></label>
                          <select
                            className={`modal-select${entry.docType ? '' : ' placeholder'}`}
                            value={entry.docType}
                            onChange={(e) => updateEntry(entry.key, { docType: e.target.value })}
                            disabled={updating}
                          >
                            <option value="" disabled>Select a type...</option>
                            {DOC_TYPE_OPTIONS.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="modal-field-label">Revision Number <span>*</span></label>
                          <input
                            type="text"
                            className="modal-input"
                            value={entry.revisionNumber}
                            onChange={(e) => updateEntry(entry.key, { revisionNumber: e.target.value })}
                            disabled={updating}
                          />
                        </div>
                      </div>

                      <div className="modal-column-right" style={{ gap: '10px' }}>
                        <div>
                          <label className="modal-field-label">Document / Drawing Description <span>*</span></label>
                          <input
                            type="text"
                            className="modal-input"
                            value={entry.description}
                            onChange={(e) => updateEntry(entry.key, { description: e.target.value })}
                            disabled={updating}
                          />
                        </div>
                        <div>
                          <label className="modal-field-label">Issue Date <span>*</span></label>
                          <input
                            type="date"
                            className="modal-input"
                            value={entry.issueDate}
                            min={earliestSelectable}
                            max={todayISO()}
                            onChange={(e) => updateEntry(entry.key, { issueDate: e.target.value })}
                            disabled={updating}
                          />
                        </div>
                        <div>
                          <label className="modal-field-label">Replace File (optional)</label>
                          {entry.file ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                              <span style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {entry.file.name}
                              </span>
                              <button
                                type="button"
                                className="refresh-btn"
                                onClick={() => updateEntry(entry.key, { file: null })}
                                disabled={updating}
                                style={{ flexShrink: 0, padding: '4px 10px', fontSize: '12px' }}
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <input
                              type="file"
                              onChange={(e) => e.target.files[0] && updateEntry(entry.key, { file: e.target.files[0] })}
                              disabled={updating}
                              style={{ fontSize: '12px' }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="modal-footer">
              {doneCount !== null ? (
                <button type="button" className="generate-din-btn modal-submit-btn" onClick={onClose}>
                  <span>Close</span>
                </button>
              ) : (
                <>
                  <button type="button" className="refresh-btn" onClick={() => setStep('select')} disabled={updating}>
                    Back
                  </button>
                  <button
                    type="submit"
                    className="generate-din-btn modal-submit-btn"
                    disabled={!allValid || updating}
                  >
                    {updating ? (
                      <>
                        <div
                          style={{
                            width: '14px', height: '14px',
                            border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#ffffff',
                            borderRadius: '50%', animation: 'spin 0.6s linear infinite',
                          }}
                        />
                        <span>
                          {updateProgress ? `Updating ${updateProgress.current} of ${updateProgress.total}...` : 'Updating...'}
                        </span>
                      </>
                    ) : (
                      <span>
                        {changedCount > 0
                          ? `Save Changes (${changedCount} of ${entries.length} modified)`
                          : 'Save Changes'}
                      </span>
                    )}
                  </button>
                </>
              )}
            </div>
          </form>
        )}
      </div>
    </>
  );
}
