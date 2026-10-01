// Shared-passcode gate for write actions (add/modify document, generate DIN, send DIN).
// The backend enforces it; this just asks the user once per browser session and attaches it.
const apiBase = `${window.location.protocol}//${window.location.hostname}:5000`;
const STORAGE_KEY = 'workshopWritePasscode';

const readStored = () => {
  try { return sessionStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
};
const writeStored = (value) => {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, value);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* storage unavailable: just ask again next time */ }
};

// Password dialog; resolves with the typed passcode, or null if cancelled.
const askPasscode = (message) =>
  new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:100000';
    overlay.innerHTML = `
      <form style="background:#fff;border-radius:10px;padding:20px;width:320px;font-family:inherit;box-shadow:0 10px 30px rgba(0,0,0,.25)">
        <div style="font-weight:700;font-size:15px;margin-bottom:6px">Passcode required</div>
        <div data-msg style="font-size:12px;color:#6b7280;margin-bottom:12px"></div>
        <input type="password" autocomplete="off" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px" />
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
          <button type="button" data-cancel style="padding:6px 14px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer">Cancel</button>
          <button type="submit" style="padding:6px 14px;border:0;background:#111827;color:#fff;border-radius:6px;cursor:pointer">Continue</button>
        </div>
      </form>`;
    overlay.querySelector('[data-msg]').textContent = message;
    const input = overlay.querySelector('input');
    const close = (value) => { overlay.remove(); resolve(value); };
    overlay.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); close(input.value); });
    overlay.querySelector('[data-cancel]').addEventListener('click', () => close(null));
    document.body.appendChild(overlay);
    input.focus();
  });

const checkPasscode = async (passcode) => {
  const res = await fetch(`${apiBase}/api/verify-passcode`, {
    method: 'POST',
    headers: { 'X-Passcode': passcode },
  });
  if (res.ok) return true;
  if (res.status === 401) return false;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error || `Server HTTP ${res.status}`);
};

// Returns a valid passcode (asking the user if needed) or throws if they cancel.
export const ensurePasscode = async () => {
  const stored = readStored();
  if (stored) return stored;
  let message = 'Enter the passcode to continue.';
  for (;;) {
    const entered = await askPasscode(message);
    if (entered === null) throw new Error('Passcode is required for this action.');
    if (await checkPasscode(entered)) {
      writeStored(entered);
      return entered;
    }
    message = 'Incorrect passcode. Try again.';
  }
};

// fetch() for write endpoints: attaches the passcode, re-asks once if the server rejects it.
export const writeFetch = async (url, options = {}) => {
  const send = async () => {
    const passcode = await ensurePasscode();
    return fetch(url, { ...options, headers: { ...(options.headers || {}), 'X-Passcode': passcode } });
  };
  let res = await send();
  if (res.status === 401) {
    writeStored('');
    res = await send();
  }
  return res;
};
