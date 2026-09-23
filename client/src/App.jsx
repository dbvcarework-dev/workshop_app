import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header.jsx';
import ProjectSelector from './components/ProjectSelector.jsx';
import MsnDocumentList from './components/MsnDocumentList.jsx';
import './index.css';

// Use the current page host so colleagues can access backend via host IP
const apiBase = `${window.location.protocol}//${window.location.hostname}:5000`;

// Read the currently-selected folder/MSN out of the URL's query string
function readStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    folder: params.get('folder') || null,
    msn: params.get('msn') || null,
  };
}

// Reflect the current selection into the URL, so a refresh (or the browser's
// back/forward buttons) lands back on the same folder + MSN instead of the default.
// `replace: true` updates the URL without adding a new history entry — used for the
// initial mount/restore so that doesn't itself become a back-button stop.
function writeStateToUrl(folderName, msnNumber, { replace = false } = {}) {
  const params = new URLSearchParams();
  if (folderName) params.set('folder', folderName);
  if (msnNumber) params.set('msn', msnNumber);
  const query = params.toString();
  const newUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  const state = { folder: folderName || null, msn: msnNumber || null };
  if (replace) {
    window.history.replaceState(state, '', newUrl);
  } else {
    window.history.pushState(state, '', newUrl);
  }
}

export default function App() {
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Documents State
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [docError, setDocError] = useState(null);

  // MSN Selection & Search Filter State
  const [selectedMsn, setSelectedMsn] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Stored DIN MSN Variable State for downstream processing
  const [generatedDinMsn, setGeneratedDinMsn] = useState(null);

  // A DIN PDF pre-fetched by the fast restore path, in parallel with the
  // folder/documents lookup — passed down so MsnDocumentList doesn't have to make its
  // own separate, sequential fetch for whatever MSN we're initially landing on.
  const [preloadedDin, setPreloadedDin] = useState(null);

  // Tracks whether the next fetchDocuments() call should still honor a `msn` value
  // restored from the URL (either on initial load, or right after a browser
  // back/forward navigation lands on a different folder). Cleared once consumed so
  // a later, unrelated folder switch doesn't reapply a stale MSN from the URL.
  const pendingUrlMsnRef = useRef(readStateFromUrl().msn);
  // First settle (initial load / restore) updates the URL in place; every later
  // folder or MSN switch pushes a real history entry so back/forward can step through them.
  const isFirstUrlSyncRef = useRef(true);
  // Set right before a popstate handler changes selectedFolder, so the fetchDocuments
  // run it triggers knows to sync state FROM the URL without also pushing a brand new
  // history entry on top of the one the browser just navigated to.
  const suppressNextUrlWriteRef = useRef(false);
  // Set by the fast restore path once it has already populated documents/selectedMsn
  // itself, so the useEffect([selectedFolder]) it triggers doesn't redundantly
  // re-fetch the same documents a second time sequentially.
  const skipNextDocFetchRef = useRef(false);

  const handleGenerateDin = async (msnNumber) => {
    setGeneratedDinMsn(msnNumber);
    console.log("📌 Stored Selected MSN Number into variable (generatedDinMsn):", msnNumber);

    // 1. Create DIN Request item in SharePoint (Status: Pending). ProjectFolderUrl scopes
    // the flow's document/folder lookups to this exact project, so two projects that
    // happen to share the same bare MSN number never get their documents/history mixed.
    const response = await fetch(`${apiBase}/api/generate-din`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msnNumber: msnNumber, folderUrl: selectedFolder?.ServerRelativeUrl || '' })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log("✅ Created DIN Request Item in SharePoint:", data);

    const itemId = data.Id;
    if (!itemId) return data;

    // 2. Poll SharePoint item status every 3 seconds until Power Automate updates Status to "Completed".
    // The flow's own trigger has up to ~60s of poll latency before it even starts, plus several
    // minutes of run time (version-history expansion per document) — 180s used to be enough but
    // now regularly isn't, which was silently showing the old PDF after a false "timeout". 600s
    // gives real headroom above the flow's actual worst-case duration.
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 200; // 200 * 3s = 600 seconds max timeout

      const pollingInterval = setInterval(async () => {
        attempts++;
        try {
          console.log(` [Status Polling] Checking Power Automate completion (Attempt ${attempts}/${maxAttempts})...`);
          const statusRes = await fetch(`${apiBase}/api/din-status?itemId=${itemId}`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData.Status === 'Completed') {
              console.log(" Power Automate completed PDF generation!");
              clearInterval(pollingInterval);
              resolve(statusData);
              return;
            }
          }
        } catch (err) {
          console.error("Polling status error:", err);
        }

        if (attempts >= maxAttempts) {
          console.warn("⚠️ Polling timed out waiting for Power Automate flow.");
          clearInterval(pollingInterval);
          resolve({ Status: 'Timeout' });
        }
      }, 3000);
    });
  };

  // Fetch project folders from local backend API server
  const fetchProjects = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/api/projects`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server HTTP ${response.status}`);
      }
      const data = await response.json();
      setFolders(data);
      if (data.length > 0) {
        const { folder: urlFolderName } = readStateFromUrl();
        const restoredFolder = urlFolderName ? data.find(f => f.Name === urlFolderName) : null;
        setSelectedFolder(restoredFolder || data[0]);
      }
    } catch (err) {
      console.error("Fetch Error:", err);
      setError(err.message || "Unable to connect to backend server. Ensure 'node server.js' is running.");
    } finally {
      setLoading(false);
    }
  };

  // Groups a folder's documents by MSN — the same logic fetchDocuments uses, extracted
  // so the fast restore path below can compute the same "default MSN" without waiting
  // for a second, separate render/effect cycle.
  const groupDocsByMsn = (docs) =>
    docs.reduce((acc, doc) => {
      const msnKey = doc.MSNNumber && doc.MSNNumber !== 'N/A' ? doc.MSNNumber : 'Unassigned / No MSN';
      if (!acc[msnKey]) acc[msnKey] = [];
      acc[msnKey].push(doc);
      return acc;
    }, {});

  // Fast path for the common "refresh with a folder+msn already in the URL" case: fetches
  // the folder list AND that folder's documents in parallel (via /api/restore) instead of
  // the normal sequential fetchProjects() -> fetchDocuments() chain, roughly halving the
  // round-trip latency. Falls back to the normal sequential flow if the folder name turns
  // out to be stale (renamed/deleted since the URL was bookmarked).
  const restoreFromUrl = async (folderName) => {
    setLoading(true);
    setError(null);

    try {
      const urlMsn = pendingUrlMsnRef.current;
      const restoreUrl = `${apiBase}/api/restore?folder=${encodeURIComponent(folderName)}`
        + (urlMsn ? `&msn=${encodeURIComponent(urlMsn)}` : '');
      const response = await fetch(restoreUrl);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server HTTP ${response.status}`);
      }
      const { folders: fetchedFolders, documents: fetchedDocuments, dinPdf } = await response.json();
      setFolders(fetchedFolders);

      const matchedFolder = fetchedFolders.find(f => f.Name === folderName);
      if (!matchedFolder || fetchedDocuments === null) {
        // Stale folder name, or folder list itself came back empty — fall back to the
        // normal default-folder behavior; the existing useEffect([selectedFolder]) will
        // fetch that folder's documents the regular sequential way.
        setSelectedFolder(fetchedFolders[0] || null);
        return;
      }

      // Fast path succeeded — populate everything now, and tell the upcoming
      // useEffect([selectedFolder]) not to redundantly re-fetch these same documents.
      skipNextDocFetchRef.current = true;
      setSelectedFolder(matchedFolder);
      setDocuments(fetchedDocuments);

      const grouped = groupDocsByMsn(fetchedDocuments);
      const msnKeys = Object.keys(grouped).length > 0
        ? Object.keys(grouped)
        : (matchedFolder.AssignedMsnNumbers || []);

      const pendingMsn = pendingUrlMsnRef.current;
      pendingUrlMsnRef.current = null;
      const nextMsn = (pendingMsn && msnKeys.includes(pendingMsn))
        ? pendingMsn
        : (msnKeys.length > 0 ? msnKeys[0] : null);

      // Only trust the pre-fetched DIN PDF if it was actually fetched for the MSN
      // we're landing on (it was requested using `pendingMsn`, which may not match
      // `nextMsn` if that URL value turned out to be invalid for this folder).
      if (dinPdf && pendingMsn && nextMsn === pendingMsn) {
        setPreloadedDin({ msn: nextMsn, data: dinPdf });
      }

      setSelectedMsn(nextMsn);
      writeStateToUrl(matchedFolder.Name, nextMsn, { replace: true });
      isFirstUrlSyncRef.current = false;
    } catch (err) {
      console.error("Restore Error:", err);
      // Fall back to the normal path entirely on a hard failure (e.g. backend down).
      await fetchProjects();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const { folder: urlFolderName } = readStateFromUrl();
    if (urlFolderName) {
      restoreFromUrl(urlFolderName);
    } else {
      fetchProjects();
    }
  }, []);

  // Fetch Documents inside selected folder
  const fetchDocuments = async (preserveMsn = false) => {
    if (!selectedFolder) {
      setDocuments([]);
      setSelectedMsn(null);
      return;
    }

    setLoadingDocs(true);
    setDocError(null);
    try {
      const encUrl = encodeURIComponent(selectedFolder.ServerRelativeUrl);
      const res = await fetch(`${apiBase}/api/documents?folderUrl=${encUrl}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setDocuments(data);
      console.log("Fetched documents:", data);

      if (!preserveMsn) {
        // Group documents to find the first MSN key as default selection
        const grouped = data.reduce((acc, doc) => {
          const msnKey = doc.MSNNumber && doc.MSNNumber !== 'N/A' ? doc.MSNNumber : 'Unassigned / No MSN';
          if (!acc[msnKey]) acc[msnKey] = [];
          acc[msnKey].push(doc);
          return acc;
        }, {});

        // Fall back to the folder's pre-assigned MSN numbers so a brand-new project
        // (zero documents) still defaults to a selectable MSN instead of none at all.
        const msnKeys = Object.keys(grouped).length > 0
          ? Object.keys(grouped)
          : (selectedFolder.AssignedMsnNumbers || []);

        // Prefer a still-pending MSN restored from the URL (initial load, or a
        // back/forward navigation that switched folders) if it's actually valid here.
        const pendingMsn = pendingUrlMsnRef.current;
        pendingUrlMsnRef.current = null;
        const nextMsn = (pendingMsn && msnKeys.includes(pendingMsn))
          ? pendingMsn
          : (msnKeys.length > 0 ? msnKeys[0] : null);

        setSelectedMsn(nextMsn);

        if (suppressNextUrlWriteRef.current) {
          // This run exists only to sync React state to a URL the browser's own
          // back/forward navigation already produced — don't push/replace on top of it.
          suppressNextUrlWriteRef.current = false;
        } else {
          writeStateToUrl(selectedFolder.Name, nextMsn, { replace: isFirstUrlSyncRef.current });
        }
        isFirstUrlSyncRef.current = false;
      }
    } catch (err) {
      console.error("Error fetching documents:", err);
      setDocError(err.message || "Failed to load documents");
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    if (skipNextDocFetchRef.current) {
      // The fast restore path already populated documents/selectedMsn for this
      // folder — skip the redundant sequential re-fetch.
      skipNextDocFetchRef.current = false;
      return;
    }
    fetchDocuments(false);
  }, [selectedFolder]);

  // Group documents by MSN, then seed in any MSN numbers pre-assigned to this project
  // (via the folder's MSN Number column) that don't have documents yet — otherwise a
  // brand-new project has no MSN to select and no way to upload its first document.
  const groupedByMsn = documents.reduce((acc, doc) => {
    const msnKey = doc.MSNNumber && doc.MSNNumber !== 'N/A' ? doc.MSNNumber : 'Unassigned / No MSN';
    if (!acc[msnKey]) acc[msnKey] = [];
    acc[msnKey].push(doc);
    return acc;
  }, {});

  for (const msn of selectedFolder?.AssignedMsnNumbers || []) {
    if (!groupedByMsn[msn]) groupedByMsn[msn] = [];
  }

  // Documents for selected MSN
  const docsForSelectedMsn = selectedMsn ? (groupedByMsn[selectedMsn] || []) : [];

  const handleSelectFolder = (selectedUrl) => {
    const folderObj = folders.find(f => f.ServerRelativeUrl === selectedUrl);
    setSelectedFolder(folderObj || null);
    // The new folder's default MSN (and the URL write for it) is settled inside
    // fetchDocuments once its data loads, so nothing more is needed here.
  };

  // Selecting an MSN directly (folder unchanged) — update the URL immediately since
  // fetchDocuments won't re-run for this (no folder change to trigger it).
  const handleSelectMsn = (msn) => {
    setSelectedMsn(msn);
    if (selectedFolder) {
      writeStateToUrl(selectedFolder.Name, msn, { replace: false });
    }
  };

  // Support the browser's actual Back/Forward buttons: read whatever folder+msn the
  // history entry we've landed on holds, and apply it.
  useEffect(() => {
    const handlePopState = () => {
      const { folder: urlFolderName, msn: urlMsn } = readStateFromUrl();
      if (!urlFolderName || folders.length === 0) return;

      const matchedFolder = folders.find(f => f.Name === urlFolderName);
      if (!matchedFolder) return;

      if (!selectedFolder || matchedFolder.Name !== selectedFolder.Name) {
        // Switching folders — let fetchDocuments (triggered by the state change below)
        // pick up this history entry's MSN once that folder's documents are loaded.
        pendingUrlMsnRef.current = urlMsn;
        suppressNextUrlWriteRef.current = true;
        setSelectedFolder(matchedFolder);
      } else if (urlMsn && urlMsn !== selectedMsn) {
        setSelectedMsn(urlMsn);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [folders, selectedFolder, selectedMsn]);

  return (
    <div className="explorer-container">
      {/* Header Bar */}
      <Header
        selectedFolder={selectedFolder}
        selectedMsn={selectedMsn}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRefresh={fetchProjects}
        loading={loading}
      />

      {/* Main Workspace */}
      <div className="explorer-body">
        {/* Left Sidebar: Projects & MSN List */}
        <ProjectSelector
          folders={folders}
          selectedFolder={selectedFolder}
          onSelectFolder={handleSelectFolder}
          groupedByMsn={groupedByMsn}
          selectedMsn={selectedMsn}
          onSelectMsn={handleSelectMsn}
          searchQuery={searchQuery}
        />

        {/* Right Content Panel: Document Viewer */}
        <MsnDocumentList
          selectedMsn={selectedMsn}
          selectedFolder={selectedFolder}
          documents={docsForSelectedMsn}
          loadingDocs={loadingDocs}
          docError={docError}
          searchQuery={searchQuery}
          onGenerateDin={handleGenerateDin}
          onRefreshDocs={() => fetchDocuments(true)}
          preloadedDin={preloadedDin}
        />
      </div>
    </div>
  );
}
