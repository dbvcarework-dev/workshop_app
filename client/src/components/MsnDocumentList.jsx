import React, { useState, useEffect, useRef } from 'react';
import DocumentUploadModal from './DocumentUploadModal';
import ModifyDocumentModal from './ModifyDocumentModal';
import SendDinEmailModal from './SendDinEmailModal';

const apiBase = `${window.location.protocol}//${window.location.hostname}:5000`;

export default function MsnDocumentList({
  selectedMsn,
  selectedFolder,
  documents,
  loadingDocs,
  docError,
  searchQuery,
  onGenerateDin,
  onRefreshDocs,
  preloadedDin
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // PDF Viewer State & DIN Generation Loading State
  const [pdfResult, setPdfResult] = useState(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const [generatingDin, setGeneratingDin] = useState(false);
  // Distinct from pdfError (which means "the PDF fetch itself failed") — this means
  // "the flow hasn't confirmed completion yet", so it needs its own, non-alarming wording.
  const [dinTimeoutNotice, setDinTimeoutNotice] = useState(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [modifyModalOpen, setModifyModalOpen] = useState(false);
  const [sendDinModalOpen, setSendDinModalOpen] = useState(false);

  // Bumped every time a PDF is (re)loaded, and used as the iframe's `key`. Without this,
  // re-setting pdfResult to an equal-looking object (same dataUrl) doesn't change the
  // iframe's `src` prop, so React leaves the existing iframe in place — and if the user
  // clicked a link inside the embedded PDF and pressed the browser's Back button, that
  // iframe's own (cross-origin) navigation history is left in a broken state React can't
  // see or reset. Forcing a fresh iframe element guarantees a clean nested browsing context.
  const [pdfViewerInstance, setPdfViewerInstance] = useState(0);

  // Tracks which MSN's preloadedDin has already been consumed, so navigating away
  // and back to the same MSN triggers a fresh fetch instead of reusing a stale snapshot.
  const consumedPreloadMsnRef = useRef(null);

  // Auto-expand list whenever a new MSN Number is selected & fetch latest DIN PDF info
  useEffect(() => {
    setIsCollapsed(true);
    setPdfError(null);
    setGeneratingDin(false);

    if (preloadedDin && preloadedDin.msn === selectedMsn && consumedPreloadMsnRef.current !== selectedMsn) {
      // The parent's fast restore path already fetched this MSN's DIN PDF in parallel —
      // use it instead of firing a redundant, sequential /api/din-pdf request.
      consumedPreloadMsnRef.current = selectedMsn;
      setPdfResult(preloadedDin.data);
      setPdfViewerInstance((n) => n + 1);
      return;
    }

    setPdfResult(null);
    if (selectedMsn) {
      handleFetchLatestPdf(selectedMsn);
    }
  }, [selectedMsn, preloadedDin]);

  // Clicking a link inside the embedded PDF navigates the tab away to that SharePoint
  // document; pressing the browser's Back button then restores our page from Chrome's
  // back-forward cache (bfcache) instead of a normal reload. That restore bypasses React
  // entirely, so nothing above re-runs — but Chromium's built-in PDF viewer frequently comes
  // back frozen/non-interactive after a bfcache restore. `pageshow` with `persisted: true`
  // is the one event that fires specifically on a bfcache restore, so we use it to force the
  // PDF iframe to remount (fresh nested browsing context = a working PDF viewer again).
  useEffect(() => {
    const handlePageShow = (event) => {
      if (event.persisted) {
        setPdfViewerInstance((n) => n + 1);
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  if (!selectedMsn) {
    return (
      <main className="content-panel">
        <div className="empty-state">
          <div className="empty-state-icon">📂</div>
          <div className="empty-state-title">No MSN Number Selected</div>
          <div className="empty-state-desc">Select an MSN number from the sidebar to view its documents.</div>
        </div>
      </main>
    );
  }

  // Parse a revision label like "R3" into a comparable number; falls back to -1 when unrecognized
  const parseRevision = (revisionNumber) => {
    const match = String(revisionNumber || '').match(/\d+/);
    return match ? parseInt(match[0], 10) : -1;
  };

  // Collapse documents down to only the latest revision per (DocNumber, DocType) group.
  // Docs without a DocNumber (legacy uploads) are kept as-is since they can't be grouped.
  const latestRevisionOnly = (docs) => {
    const groups = new Map();
    const ungrouped = [];

    for (const doc of docs) {
      if (!doc.DocNumber) {
        ungrouped.push(doc);
        continue;
      }
      const key = `${doc.DocNumber}::${doc.DocType}`;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, doc);
        continue;
      }

      const docRev = parseRevision(doc.RevisionNumber);
      const existingRev = parseRevision(existing.RevisionNumber);
      const docTime = new Date(doc.TimeCreated || doc.TimeLastModified || 0).getTime();
      const existingTime = new Date(existing.TimeCreated || existing.TimeLastModified || 0).getTime();

      // Prefer higher revision number; if they tie or can't be parsed, prefer the most recently created
      const docIsNewer = docRev !== existingRev ? docRev > existingRev : docTime > existingTime;
      if (docIsNewer) {
        groups.set(key, doc);
      }
    }

    return [...groups.values(), ...ungrouped];
  };

  const filteredDocs = latestRevisionOnly(documents)
    .filter(doc => doc.Name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => new Date(b.TimeCreated || b.TimeLastModified || 0) - new Date(a.TimeCreated || a.TimeLastModified || 0));

  const latestUploadedDoc = filteredDocs[0];
  const latestUploadDate = latestUploadedDoc
    ? new Date(latestUploadedDoc.TimeCreated || latestUploadedDoc.TimeLastModified || 0)
    : null;

  const latestDinDate = pdfResult?.timeCreated
    ? new Date(pdfResult.timeCreated)
    : null;

  // DIN is stale if a new document was uploaded AFTER the latest DIN PDF was generated
  const isDinStale = Boolean(
    latestUploadDate &&
    latestDinDate &&
    latestUploadDate.getTime() > latestDinDate.getTime()
  );

  // No DIN has ever been generated for this MSN at all (e.g. a brand-new project's first
  // upload) — isDinStale can't cover this since it requires an existing DIN to compare
  // against. Gated on !loadingPdf so the banner doesn't flash before the initial fetch
  // (which 404s and is silently caught) resolves.
  const hasNeverGeneratedDin = Boolean(latestUploadDate && !latestDinDate && !loadingPdf);
  const needsDinGeneration = isDinStale || hasNeverGeneratedDin;

  // The DIN's issue columns are chronological, so a new document can't be issued before the
  // latest issue already recorded. This mirrors the flow's own coalesce(CustomDate, Created)
  // and compares the UTC date portion, which is what formatDateTime() buckets columns by.
  const issueDateOf = (doc) => {
    const raw = doc.CustomDate || doc.TimeCreated || doc.TimeLastModified;
    return raw ? String(raw).slice(0, 10) : null;
  };

  const latestIssueDate = documents.reduce((latest, doc) => {
    const date = issueDateOf(doc);
    return date && (!latest || date > latest) ? date : latest;
  }, null);

  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    switch (ext) {
      case 'pdf': return '';
      case 'doc':
      case 'docx': return '';
      case 'xls':
      case 'xlsx': return '';
      case 'dwg': return '';
      case 'png':
      case 'jpg': return '';
      default: return '';
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleGenerateDin = async () => {
    if (onGenerateDin) {
      setGeneratingDin(true);
      setPdfError(null);
      setDinTimeoutNotice(null);
      try {
        const result = await onGenerateDin(selectedMsn);
        // Only refresh the viewer once the flow actually reports Completed — on a
        // timeout, the new PDF may not exist yet, and silently re-fetching would just
        // redisplay the same old PDF with no indication anything went wrong. Surface
        // the timeout explicitly instead so the user knows to check back / retry.
        if (result?.Status === 'Completed') {
          await handleFetchLatestPdf(selectedMsn);
        } else if (result?.Status === 'Timeout') {
          setDinTimeoutNotice('DIN generation is taking longer than expected. It may still complete in the background — try "View Latest DIN PDF" again in a minute.');
        }
      } catch (err) {
        console.error("Error generating DIN:", err);
        setPdfError(err.message || 'Failed to generate DIN');
      } finally {
        setGeneratingDin(false);
      }
    }
  };

  // Fetch the latest generated DIN PDF from "DIN pdfs" SharePoint library
  const handleFetchLatestPdf = async (targetMsn = selectedMsn) => {
    if (!targetMsn) return;
    setLoadingPdf(true);
    setPdfError(null);
    try {
      const res = await fetch(`${apiBase}/api/din-pdf?msnNumber=${encodeURIComponent(targetMsn)}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setPdfResult(data);
      setPdfViewerInstance((n) => n + 1);
      console.log("pdf result", data);
    } catch (err) {
      console.error("Error fetching DIN PDF:", err);
      // Silent catch if no DIN PDF exists yet
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleRefreshDocsWithDin = async () => {
    if (onRefreshDocs) {
      await onRefreshDocs();
    }
  };

  return (
    <>
      <main className="content-panel">
      
      {/* 1. Action Buttons Container (Top) */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginBottom: '20px' }}>
        {/* Add Document Button */}
        <button
          type="button"
          className="refresh-btn"
          onClick={() => setUploadModalOpen(true)}
          title="Upload a new document to SharePoint"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span>Add Document</span>
        </button>
        {/* Modify Existing Document Button */}
        <button
          type="button"
          className="refresh-btn"
          onClick={() => setModifyModalOpen(true)}
          title="Update fields or replace the file of an already-uploaded document"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          <span>Modify Existing Document</span>
        </button>
        {/* View Latest DIN PDF Button */}
        <button
          type="button"
          className="refresh-btn"
          onClick={() => handleFetchLatestPdf(selectedMsn)}
          disabled={loadingPdf}
          title="Fetch and display the latest generated DIN PDF from SharePoint"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <span>{loadingPdf ? 'Loading PDF...' : 'View Latest DIN PDF'}</span>
        </button>

        {/* Generate DIN Button */}
        <button
          type="button"
          className="generate-din-btn"
          onClick={handleGenerateDin}
          disabled={generatingDin || loadingPdf}
        >
          {generatingDin ? (
            <>
              <div
                style={{
                  width: '14px',
                  height: '14px',
                  border: '2px solid rgba(255,255,255,0.4)',
                  borderTopColor: '#ffffff',
                  borderRadius: '50%',
                  animation: 'spin 0.6s linear infinite',
                  opacity : '0.5'
                }}
              />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="12" y1="18" x2="12" y2="12"></line>
                <line x1="9" y1="15" x2="15" y2="15"></line>
              </svg>
              <span>Generate DIN</span>
            </>
          )}
        </button>

        {/* Send DIN Email Button — only shown once a DIN exists and is not outdated */}
        {pdfResult && !isDinStale && (
          <button
            type="button"
            className="refresh-btn"
            onClick={() => setSendDinModalOpen(true)}
            title="Email the latest DIN to a department"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <span>Send DIN</span>
          </button>
        )}
      </div>

      {/* 2. Outdated / Never-Generated DIN Warning Banner */}
      {needsDinGeneration && (
        <div style={{
          marginBottom: '18px',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '10px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          boxShadow: '0 2px 5px rgba(220, 38, 38, 0.06)',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px', height: '36px',
              backgroundColor: '#fee2e2', color: '#dc2626',
              borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              animation: 'gentlePulse 2.2s infinite ease-out'
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#991b1b' }}>
                {hasNeverGeneratedDin
                  ? 'No DIN Generated Yet'
                  : 'New Document Detected — DIN Needs Regeneration'}
              </div>
              <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '2px', lineHeight: '1.4' }}>
                {hasNeverGeneratedDin
                  ? <>A document was uploaded on <strong>{latestUploadDate.toLocaleString()}</strong>, but no DIN has been generated for this MSN yet.</>
                  : <>A document uploaded on <strong>{latestUploadDate ? latestUploadDate.toLocaleString() : 'N/A'}</strong> is newer than your last DIN generated on <strong>{latestDinDate ? latestDinDate.toLocaleString() : 'N/A'}</strong>.</>}
              </div>
            </div>
          </div>
          <span style={{
            fontSize: '11px',
            fontWeight: '700',
            backgroundColor: '#dc2626',
            color: '#ffffff',
            padding: '4px 10px',
            borderRadius: '12px',
            whiteSpace: 'nowrap',
            letterSpacing: '0.03em',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: '#ffffff',
              display: 'inline-block',
              animation: 'gentlePulse 1.8s infinite'
            }} />
            Action Required
          </span>
        </div>
      )}

      {/* Still-processing notice — flow hasn't confirmed completion within the wait window */}
      {dinTimeoutNotice && (
        <div className="error-alert" style={{ marginBottom: '18px', borderColor: '#f5c451', backgroundColor: '#fff8e6' }}>
          <p style={{ margin: '0 0 4px 0', fontWeight: '600' }}>⏳ Still processing</p>
          <p style={{ margin: 0, fontSize: '13px' }}>{dinTimeoutNotice}</p>
        </div>
      )}

      {/* 3. PDF Error Display */}
      {pdfError && (
        <div className="error-alert" style={{ marginBottom: '18px' }}>
          <p style={{ margin: '0 0 4px 0', fontWeight: '600' }}>⚠️ Could not load DIN PDF</p>
          <p style={{ margin: 0, fontSize: '13px' }}>{pdfError}</p>
        </div>
      )}

      {/* 4. Embedded Live PDF Document Viewer */}
      {pdfResult && (
        <div style={{
          marginBottom: '20px',
          backgroundColor: '#ffffff',
          borderRadius: '10px',
          border: '0.5px solid var(--border-color)',
          padding: '16px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-main)' }}>
                 Latest DIN PDF: {pdfResult.name}
              </h4>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Created in SharePoint: {new Date(pdfResult.timeCreated).toLocaleString()}
              </p>
            </div>
            <button
              onClick={() => setPdfResult(null)}
              className="refresh-btn"
              style={{ padding: '4px 10px', fontSize: '12px' }}
            >
              Close PDF
            </button>
          </div>

          <iframe
            key={pdfViewerInstance}
            src={pdfResult.dataUrl}
            width="100%"
            height="650px"
            title="Latest DIN PDF Document"
            style={{ border: 'none', borderRadius: '6px' }}
          />
        </div>
      )}

      {/* 5. Header Info Card */}
      <div
        className="doc-header-card"
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
        title={isCollapsed ? 'Click to expand document list' : 'Click to collapse document list'}
      >
        <div className="doc-header-info">
          <div className="doc-header-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
          </div>
          <div>
            <div className="doc-header-title">MSN Number: {selectedMsn}</div>
            <div className="doc-header-sub">
              Displaying {filteredDocs.length} document(s) registered under this MSN
            </div>
          </div>
        </div>

        {/* Chevron Collapse Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '500' }}>
            {isCollapsed ? 'Expand' : 'Collapse'}
          </span>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transition: 'transform 0.2s ease',
              transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              color: 'var(--text-secondary)'
            }}
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
      </div>

      {/* Collapsible Document Table Section ONLY */}
      {!isCollapsed && (
        <>
          {loadingDocs ? (
            <div className="loading-container">
              <div className="spinner-lg"></div>
              <p className="loading-text">Fetching documents from SharePoint...</p>
            </div>
          ) : docError ? (
            <div className="error-alert">
              <p style={{ margin: '0 0 4px 0', fontWeight: '600' }}>⚠️ Failed to load documents</p>
              <p style={{ margin: 0, fontSize: '13px' }}>{docError}</p>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📄</div>
              <div className="empty-state-title">No Matching Documents</div>
              <div className="empty-state-desc">No documents found matching your filter criteria.</div>
            </div>
          ) : (
            <div className="doc-table-container">
              <table className="doc-table">
                <thead>
                  <tr>
                    <th>Document Name</th>
                    <th>Path / Reference</th>
                    <th>Revision</th>
                    <th>Size</th>
                    <th>Created </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map((doc, idx) => (
                    <tr key={idx}>
                      <td>
                        <div className="file-name-cell">
                          <span className="file-icon">{getFileIcon(doc.Name)}</span>
                          <span>{doc.Name}</span>
                        </div>
                      </td>
                      <td>
                        <code className="file-path-code">{doc.ServerRelativeUrl}</code>
                      </td>
                      <td>{doc.RevisionNumber || 'N/A'}</td>
                      <td>{formatFileSize(doc.Length)}</td>
                      <td>
                        {doc.TimeCreated
                          ? new Date(doc.TimeCreated).toLocaleDateString()
                          : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

    </main>

      {/* Document Upload Modal */}
      {uploadModalOpen && (
        <DocumentUploadModal
          selectedMsn={selectedMsn}
          selectedFolder={selectedFolder}
          minIssueDate={latestIssueDate}
          onClose={() => setUploadModalOpen(false)}
          onUploadSuccess={handleRefreshDocsWithDin}
        />
      )}

      {/* Modify Existing Document Modal */}
      {modifyModalOpen && (
        <ModifyDocumentModal
          selectedMsn={selectedMsn}
          selectedFolder={selectedFolder}
          documents={filteredDocs}
          minIssueDate={latestIssueDate}
          onClose={() => setModifyModalOpen(false)}
          onUpdateSuccess={handleRefreshDocsWithDin}
        />
      )}

      {/* Send DIN Email Modal */}
      {sendDinModalOpen && (
        <SendDinEmailModal
          selectedMsn={selectedMsn}
          onClose={() => setSendDinModalOpen(false)}
        />
      )}
    </>
  );
}
