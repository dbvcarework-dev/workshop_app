import React, { useState, useEffect } from 'react';
import Header from './components/Header.jsx';
import ProjectSelector from './components/ProjectSelector.jsx';
import MsnDocumentList from './components/MsnDocumentList.jsx';
import './index.css';

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

  const handleGenerateDin = async (msnNumber) => {
    setGeneratedDinMsn(msnNumber);
    console.log("📌 Stored Selected MSN Number into variable (generatedDinMsn):", msnNumber);

    // 1. Create DIN Request item in SharePoint (Status: Pending)
    const response = await fetch('http://localhost:5000/api/generate-din', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msnNumber: msnNumber })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log("✅ Created DIN Request Item in SharePoint:", data);

    const itemId = data.Id;
    if (!itemId) return data;

    // 2. Poll SharePoint item status every 3 seconds until Power Automate updates Status to "Completed"
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 60; // 60 * 3s = 180 seconds max timeout

      const pollingInterval = setInterval(async () => {
        attempts++;
        try {
          console.log(` [Status Polling] Checking Power Automate completion (Attempt ${attempts}/${maxAttempts})...`);
          const statusRes = await fetch(`http://localhost:5000/api/din-status?itemId=${itemId}`);
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
      const response = await fetch('http://localhost:5000/api/projects');
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server HTTP ${response.status}`);
      }
      const data = await response.json();
      setFolders(data);
      if (data.length > 0) {
        setSelectedFolder(data[0]);
      }
    } catch (err) {
      console.error("Fetch Error:", err);
      setError(err.message || "Unable to connect to backend server. Ensure 'node server.js' is running.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
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
      const res = await fetch(`http://localhost:5000/api/documents?folderUrl=${encUrl}`);
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

        const msnKeys = Object.keys(grouped);
        if (msnKeys.length > 0) {
          setSelectedMsn(msnKeys[0]);
        } else {
          setSelectedMsn(null);
        }
      }
    } catch (err) {
      console.error("Error fetching documents:", err);
      setDocError(err.message || "Failed to load documents");
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    fetchDocuments(false);
  }, [selectedFolder]);

  // Group documents by MSN
  const groupedByMsn = documents.reduce((acc, doc) => {
    const msnKey = doc.MSNNumber && doc.MSNNumber !== 'N/A' ? doc.MSNNumber : 'Unassigned / No MSN';
    if (!acc[msnKey]) acc[msnKey] = [];
    acc[msnKey].push(doc);
    return acc;
  }, {});

  // Documents for selected MSN
  const docsForSelectedMsn = selectedMsn ? (groupedByMsn[selectedMsn] || []) : [];

  const handleSelectFolder = (selectedUrl) => {
    const folderObj = folders.find(f => f.ServerRelativeUrl === selectedUrl);
    setSelectedFolder(folderObj || null);
  };

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
          onSelectMsn={setSelectedMsn}
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
        />
      </div>
    </div>
  );
}
