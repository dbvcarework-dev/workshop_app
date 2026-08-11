import React, { useState, useEffect } from 'react';
import DocumentUploadModal from './DocumentUploadModal';

export default function MsnDocumentList({
  selectedMsn,
  selectedFolder,
  documents,
  loadingDocs,
  docError,
  searchQuery,
  onGenerateDin,
  onRefreshDocs
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  // PDF Viewer State & DIN Generation Loading State
  const [pdfResult, setPdfResult] = useState(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const [generatingDin, setGeneratingDin] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // Auto-expand list whenever a new MSN Number is selected & fetch latest DIN PDF info
  useEffect(() => {
    setIsCollapsed(true);
    setPdfResult(null);
    setPdfError(null);
    setGeneratingDin(false);
    if (selectedMsn) {
      handleFetchLatestPdf(selectedMsn);
    }
  }, [selectedMsn]);

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

  const filteredDocs = documents
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
      try {
        await onGenerateDin(selectedMsn);
        // Automatically fetch & render the newly generated DIN PDF on screen!
        await handleFetchLatestPdf(selectedMsn);
      } catch (err) {
        console.error("Error generating DIN:", err);
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
      const res = await fetch(`http://localhost:5000/api/din-pdf?msnNumber=${encodeURIComponent(targetMsn)}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setPdfResult(data);
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
      </div>

      {/* 2. Outdated DIN Warning Banner */}
      {isDinStale && (
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
                New Document Detected — DIN Needs Regeneration
              </div>
              <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '2px', lineHeight: '1.4' }}>
                A document uploaded on <strong>{latestUploadDate ? latestUploadDate.toLocaleString() : 'N/A'}</strong> is newer than your last DIN generated on <strong>{latestDinDate ? latestDinDate.toLocaleString() : 'N/A'}</strong>.
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
          onClose={() => setUploadModalOpen(false)}
          onUploadSuccess={handleRefreshDocsWithDin}
        />
      )}
    </>
  );
}
