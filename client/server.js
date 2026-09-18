import http from 'http';
import { getProjectFolders, getFolderDocuments, createDinRequest, getLatestDinPdfDataUrl, getDinRequestStatus, uploadDocumentToSharePoint, getDocumentTypeDepartments, createDinEmailRequest, getDinEmailRequestStatus } from './src/services/fetchProjects.js';

const PORT = 5000;

const server = http.createServer(async (req, res) => {
  // Set CORS headers for React frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);

  // API endpoint: GET /api/projects
  if (parsedUrl.pathname === '/api/projects' && req.method === 'GET') {
    try {
      console.log("🌐 Received GET /api/projects request from React frontend...");
      const folders = await getProjectFolders();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(folders));
    } catch (err) {
      console.error("❌ API Error:", err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  } 
  // API endpoint: GET /api/documents?folderUrl=...
  else if (parsedUrl.pathname === '/api/documents' && req.method === 'GET') {
    const folderUrl = parsedUrl.searchParams.get('folderUrl');
    if (!folderUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing folderUrl query parameter' }));
      return;
    }

    try {
      console.log(`🌐 Received GET /api/documents request for folder: "${folderUrl}"...`);
      const documents = await getFolderDocuments(folderUrl);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(documents));
    } catch (err) {
      console.error("❌ Documents API Error:", err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }
  // API endpoint: GET /api/din-pdf?msnNumber=...
  else if (parsedUrl.pathname === '/api/din-pdf' && req.method === 'GET') {
    const msnNumber = parsedUrl.searchParams.get('msnNumber');
    if (!msnNumber) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing msnNumber query parameter' }));
      return;
    }

    try {
      console.log(`🌐 Received GET /api/din-pdf for MSN: "${msnNumber}"...`);
      const pdfResult = await getLatestDinPdfDataUrl(msnNumber);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(pdfResult));
    } catch (err) {
      console.error("❌ DIN PDF API Error:", err.message);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }
  // Debug endpoint: list DIN pdf files and match info for an MSN
  else if (parsedUrl.pathname === '/api/din-pdfs-list' && req.method === 'GET') {
    const msnNumber = parsedUrl.searchParams.get('msnNumber');
    if (!msnNumber) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing msnNumber query parameter' }));
      return;
    }

    try {
      console.log(`🌐 Received GET /api/din-pdfs-list for MSN: "${msnNumber}"...`);
      const rows = await listDinPdfFiles(msnNumber);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(rows, null, 2));
    } catch (err) {
      console.error('❌ DIN PDFs List API Error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }
  // API endpoint: GET /api/din-status?itemId=...
  else if (parsedUrl.pathname === '/api/din-status' && req.method === 'GET') {
    const itemId = parsedUrl.searchParams.get('itemId');
    if (!itemId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing itemId query parameter' }));
      return;
    }

    try {
      const statusResult = await getDinRequestStatus(itemId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(statusResult));
    } catch (err) {
      console.error("❌ DIN Status API Error:", err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }
  // API endpoint: POST /api/generate-din
  else if (parsedUrl.pathname === '/api/generate-din' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { msnNumber } = JSON.parse(body || '{}');
        if (!msnNumber) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing msnNumber in request body' }));
          return;
        }

        console.log(`🌐 Received POST /api/generate-din for MSN: "${msnNumber}"...`);
        const result = await createDinRequest(msnNumber);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error("❌ Generate DIN API Error:", err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      } 
    }); 
  }
  // API endpoint: GET /api/document-type-departments
  else if (parsedUrl.pathname === '/api/document-type-departments' && req.method === 'GET') {
    try {
      const rows = await getDocumentTypeDepartments();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(rows));
    } catch (err) {
      console.error("❌ Document Type Departments API Error:", err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }
  // API endpoint: POST /api/send-din-email
  else if (parsedUrl.pathname === '/api/send-din-email' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { msnNumber, documentTypes } = JSON.parse(body || '{}');
        if (!msnNumber || !Array.isArray(documentTypes) || documentTypes.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing msnNumber or documentTypes in request body' }));
          return;
        }

        console.log(`🌐 Received POST /api/send-din-email for MSN "${msnNumber}" -> document types [${documentTypes.join(', ')}]...`);
        const result = await createDinEmailRequest(msnNumber, documentTypes);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error("❌ Send DIN Email API Error:", err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  }
  // API endpoint: GET /api/din-email-status?itemId=...
  else if (parsedUrl.pathname === '/api/din-email-status' && req.method === 'GET') {
    const itemId = parsedUrl.searchParams.get('itemId');
    if (!itemId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing itemId query parameter' }));
      return;
    }

    try {
      const statusResult = await getDinEmailRequestStatus(itemId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(statusResult));
    } catch (err) {
      console.error("❌ DIN Email Status API Error:", err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }
  // API endpoint: POST /api/upload-document
  else if (parsedUrl.pathname === '/api/upload-document' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { folderUrl, fileName, fileDataBase64, docNumber, docType, revisionNumber, description, issueDate, msnNumber } = JSON.parse(body || '{}');

        if (!folderUrl || !fileName || !fileDataBase64) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing required parameters: folderUrl, fileName, or fileDataBase64' }));
          return;
        }

        // Guard the issue date server-side, since the date picker's restrictions can be bypassed.
        // Shape is checked before comparing, otherwise garbage input sorts as a "future" date.
        if (issueDate) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Issue date must be in YYYY-MM-DD format' }));
            return;
          }
          if (issueDate > new Date().toISOString().split('T')[0]) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Issue date cannot be in the future' }));
            return;
          }
        }

        console.log(`🌐 Received POST /api/upload-document for file "${fileName}" in folder "${folderUrl}"...`);
        
        // Convert Base64 payload back to binary Buffer
        const fileBuffer = Buffer.from(fileDataBase64, 'base64');

        const uploadResult = await uploadDocumentToSharePoint({
          folderUrl,
          fileName,
          fileBuffer,
          metadata: {
            msnNumber,
            docNumber,
            docType,
            revisionNumber,
            description,
            issueDate
          }
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(uploadResult));
      } catch (err) {
        console.error("❌ Document Upload API Error:", err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else { 
    // Diagnostic endpoint: GET /api/diagnostic
    if (parsedUrl.pathname === '/api/diagnostic' && req.method === 'GET') {
      const requesterIp = req.socket && (req.socket.remoteAddress || req.headers['x-forwarded-for']) || 'unknown';
      const payload = {
        ok: true,
        serverTime: new Date().toISOString(),
        requesterIp,
        method: req.method,
        headers: {
          host: req.headers.host,
          origin: req.headers.origin || null,
          'user-agent': req.headers['user-agent'] || null,
        },
        availableEndpoints: [
          '/api/projects',
          '/api/documents?folderUrl=...',
          '/api/din-pdf?msnNumber=...',
          '/api/generate-din',
          '/api/upload-document',
          '/api/din-status?itemId=...'
        ]
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload, null, 2));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint Not Found' }));
  } 
}); 
 
server.listen(PORT, () => { 
  console.log(`\n🚀 Backend API Server running at http://localhost:${PORT}`); 
  console.log(`   API Endpoint: GET http://localhost:${PORT}/api/projects\n`);   
});
