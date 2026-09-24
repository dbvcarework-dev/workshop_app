import React, { useState } from 'react';

// Known issuers, shown as quick picks. Anyone else uses "Other" and types a name.
export const ISSUER_OPTIONS = ['PB', 'ST', 'CS'];
const OTHER = '__other__';
const LAST_ISSUER_KEY = 'din.lastIssuedBy';

// Mirrors the server-side check in /api/generate-din. The name is later embedded in a
// JSON body and in the PDF's HTML, so quotes and angle brackets must never get through.
export const ISSUER_PATTERN = /^[A-Za-z][A-Za-z .-]{0,39}$/;

function readLastIssuer() {
  try {
    return localStorage.getItem(LAST_ISSUER_KEY) || '';
  } catch {
    return '';
  }
}

function saveLastIssuer(name) {
  try {
    localStorage.setItem(LAST_ISSUER_KEY, name);
  } catch {
    // Storage unavailable (private window etc.) — remembering the choice is only a convenience.
  }
}

export default function IssueDinModal({ selectedMsn, onClose, onConfirm }) {
  const last = readLastIssuer();
  const lastIsKnown = ISSUER_OPTIONS.includes(last);
  const [choice, setChoice] = useState(lastIsKnown ? last : (last ? OTHER : ''));
  const [otherName, setOtherName] = useState(lastIsKnown ? '' : last);

  const issuedBy = (choice === OTHER ? otherName : choice).trim();
  const isValid = ISSUER_PATTERN.test(issuedBy);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid) return;
    saveLastIssuer(issuedBy);
    onConfirm(issuedBy);
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />

      <div className="modal-container" role="dialog" aria-modal="true" aria-labelledby="issue-din-title">
        <div className="modal-header">
          <div className="modal-header-left">
            <div>
              <div id="issue-din-title" className="modal-header-title">Generate DIN</div>
              <div className="modal-header-sub">Who is issuing the DIN for MSN {selectedMsn}?</div>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label className="modal-field-label" htmlFor="issued-by-select">Issued by <span>*</span></label>
              <select
                id="issued-by-select"
                className={`modal-select${choice ? '' : ' placeholder'}`}
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
                autoFocus
              >
                <option value="" disabled>Select a name...</option>
                {ISSUER_OPTIONS.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
                <option value={OTHER}>Other</option>
              </select>
            </div>

            {choice === OTHER && (
              <div>
                <label className="modal-field-label" htmlFor="issued-by-other">Name <span>*</span></label>
                <input
                  id="issued-by-other"
                  type="text"
                  className="modal-input"
                  value={otherName}
                  onChange={(e) => setOtherName(e.target.value)}
                  placeholder="e.g. RK"
                  maxLength={40}
                  autoFocus
                />
                {otherName.trim() && !isValid && (
                  <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#b91c1c' }}>
                    Use letters, spaces, dots or hyphens only (max 40 characters).
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="refresh-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="generate-din-btn modal-submit-btn" disabled={!isValid}>
              <span>Generate DIN</span>
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
