import http from 'http';
import { getProjectFolders, getFolderDocuments, createDinRequest, getLatestDinPdfDataUrl, getDinRequestStatus, uploadDocumentToSharePoint } from './src/services/fetchProjects.js';

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
  // API endpoint: POST /api/upload-document
  else if (parsedUrl.pathname === '/api/upload-document' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { folderUrl, fileName, fileDataBase64, docNumber, docType, revisionNumber, msnNumber } = JSON.parse(body || '{}');

        if (!folderUrl || !fileName || !fileDataBase64) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing required parameters: folderUrl, fileName, or fileDataBase64' }));
          return;
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
            revisionNumber
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
    res.writeHead(404, { 'Content-Type': 'application/json' }); 
    res.end(JSON.stringify({ error: 'Endpoint Not Found' })); 
  } 
}); 
 
server.listen(PORT, () => { 
  console.log(`\n🚀 Backend API Server running at http://localhost:${PORT}`); 
  console.log(`   API Endpoint: GET http://localhost:${PORT}/api/projects\n`);   
});
