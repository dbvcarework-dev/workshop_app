import React, { useState, useEffect } from 'react';

const apiBase = `${window.location.protocol}//${window.location.hostname}:5000`;

export default function SendDinEmailModal({ selectedMsn, onClose }) {
  const [rows, setRows] = useState([]); // [{ docType, department }]
  const [loadingRows, setLoadingRows] = useState(true);
  const [selectedDocTypes, setSelectedDocTypes] = useState([]);
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [sendError, setSendError] = useState(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/document-type-departments`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setRows(data);
      } catch (err) {
        console.error('❌ Failed to load document type/department list:', err);
        setSendError('Could not load document type / department list.');
      } finally {
        setLoadingRows(false);
      }
    })();
  }, []);

  const toggleDocType = (docType) => {
    setSelectedDocTypes((prev) =>
      prev.includes(docType) ? prev.filter((t) => t !== docType) : [...prev, docType]
    );
  };

  const pollForCompletion = (itemId) => {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 60; // 60 * 3s = 180 seconds max timeout

      const pollingInterval = setInterval(async () => {
        attempts++;
        try {
          setStatusMessage(`Waiting for email to be sent... (${attempts * 3}s)`);
          const statusRes = await fetch(`${apiBase}/api/din-email-status?itemId=${itemId}`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData.Status === 'Sent') {
              clearInterval(pollingInterval);
              resolve({ status: 'Sent' });
              return;
            }
            if (statusData.Status === 'Failed') {
              clearInterval(pollingInterval);
              resolve({ status: 'Failed' });
              return;
            }
          }
        } catch (err) {
          console.error('Polling DIN email status error:', err);
        }

        if (attempts >= maxAttempts) {
          clearInterval(pollingInterval);
          resolve({ status: 'Timeout' });
        }
      }, 3000);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedDocTypes.length === 0 || sending) return;

    setSending(true);
    setSendError(null);
    setStatusMessage('Creating email request...');

    try {
      const response = await fetch(`${apiBase}/api/send-din-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msnNumber: selectedMsn, documentTypes: selectedDocTypes }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const { itemId } = await response.json();
      if (!itemId) throw new Error('Request created but no item ID was returned');

      const result = await pollForCompletion(itemId);
      if (result.status === 'Sent') {
        setSent(true);
      } else if (result.status === 'Failed') {
        throw new Error('The flow reported the email failed to send.');
      } else {
        throw new Error('Timed out waiting for the email to be sent. Check the flow run history.');
      }
    } catch (err) {
      console.error('❌ Send DIN Email Error:', err);
      setSendError(err.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={!sending ? onClose : undefined} />

      <div
        className="modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-din-modal-title"
      >
        <div className="modal-header">
          <div className="modal-header-left">
            <div className="modal-header-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <div>
              <div id="send-din-modal-title" className="modal-header-title">Send DIN by Email</div>
              <div className="modal-header-sub">Email the latest DIN for MSN {selectedMsn} by document type</div>
            </div>
          </div>

          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={sending}
            aria-label="Close modal"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {sendError && (
              <div className="error-alert" style={{ marginBottom: 0 }}>
                <p style={{ margin: '0 0 4px 0', fontWeight: '600' }}>⚠️ Send Failed</p>
                <p style={{ margin: 0, fontSize: '13px' }}>{sendError}</p>
              </div>
            )}

            {sent ? (
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
                  DIN sent successfully
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  The latest DIN for MSN {selectedMsn} was emailed to the selected departments.
                </div>
              </div>
            ) : sending ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
                padding: '24px 12px', textAlign: 'center'
              }}>
                <div
                  style={{
                    width: '22px',
                    height: '22px',
                    border: '3px solid rgba(0,0,0,0.1)',
                    borderTopColor: 'var(--text-main)',
                    borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite',
                  }}
                />
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{statusMessage}</div>
              </div>
            ) : (
              <div>
                <label className="modal-field-label">
                  Document Type(s) <span>*</span>
                </label>
                {loadingRows ? (
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Loading document types...</div>
                ) : rows.length === 0 ? (
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No document type / department rows found.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {rows.map((row) => (
                      <label
                        key={row.docType}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          fontSize: '13px', cursor: 'pointer'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedDocTypes.includes(row.docType)}
                          onChange={() => toggleDocType(row.docType)}
                        />
                        <span>{row.docType}</span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                          ({Array.isArray(row.department) ? row.department.join(', ') : row.department})
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="refresh-btn" onClick={onClose} disabled={sending}>
              {sent ? 'Close' : 'Cancel'}
            </button>
            {!sent && (
              <button
                type="submit"
                className="generate-din-btn modal-submit-btn"
                disabled={selectedDocTypes.length === 0 || sending || loadingRows}
              >
                {sending ? (
                  <span>Sending...</span>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    <span>Send DIN</span>
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </>
  );
}
