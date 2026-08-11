import fs from 'fs';
import path from 'path';

// 1. Environment Parser (handles CRLF \r\n and quotes)
function loadEnv() {
  const candidates = [
    path.resolve('.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'client', '.env'),
    path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1')), '../../.env')
  ];

  let envPath = candidates.find(p => fs.existsSync(p));
  if (envPath) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = trimmed.match(/^([\w.-]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2] ? match[2].trim() : '';
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.substring(1, value.length - 1);
        }
        process.env[key] = value.trim();
      }
    });
  }
}

loadEnv();

const TENANT_ID = process.env.TENANT_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SHAREPOINT_SITE_URL = process.env.SHAREPOINT_SITE_URL || 'https://vcareengineering.sharepoint.com/sites/WorkshopEDMS';
const DOCUMENT_LIBRARY_PATH = process.env.DOCUMENT_LIBRARY_PATH || '/sites/WorkshopEDMS/Workshop files';
const USER_EMAIL = process.env.USER_EMAIL;
const USER_PASSWORD = process.env.USER_PASSWORD;
const TOKEN_CACHE_FILE = path.resolve('.token_cache.json');

// Parse domain and site relative path from full SharePoint URL
let SHAREPOINT_DOMAIN = 'vcareengineering.sharepoint.com';
let SITE_PATH = '/sites/WorkshopEDMS';
try {
  const parsedUrl = new URL(SHAREPOINT_SITE_URL);
  SHAREPOINT_DOMAIN = parsedUrl.hostname;
  SITE_PATH = parsedUrl.pathname.replace(/\/$/, '');
} catch (e) {
  console.warn("⚠️ Could not parse SHAREPOINT_SITE_URL, using default domain and site path.");
}

// Token Cache Management
function saveTokenCache(data) {
  try {
    const cacheData = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      expires_at: Date.now() + ((data.expires_in || 3600) - 300) * 1000, // Safety margin of 5 mins
    };
    fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf8');
  } catch (e) {
    console.warn("⚠️ Could not save token cache to disk:", e.message);
  }
}

function loadTokenCache() {
  try {
    if (fs.existsSync(TOKEN_CACHE_FILE)) {
      const content = fs.readFileSync(TOKEN_CACHE_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    return null;
  }
  return null;
}

// Decode JWT helper for diagnostics
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

// Validate essential environment variables
function validateConfig() {
  const missing = [];
  if (!TENANT_ID) missing.push('TENANT_ID');
  if (!CLIENT_ID) missing.push('CLIENT_ID');
  if (missing.length > 0) {
    console.error(`❌ Error: Missing required environment variables in .env: ${missing.join(', ')}`);
    process.exit(1);
  }
}

// Silent Token Refresh using Refresh Token
async function refreshAccessToken(refreshToken, scope) {
  console.log("🔄 Cached access token expired. Refreshing token silently with Entra ID...");
  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
    scope: scope,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Silent Refresh Failed: ${data.error_description || data.error}`);
  }
  saveTokenCache(data);
  console.log("✅ Token refreshed silently!\n");
  return data.access_token;
}

// Device Code Authorization Flow
async function getDelegatedTokenViaDeviceCodeData(scope) {
  const deviceCodeUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/devicecode`;
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: scope,
  });

  const response = await fetch(deviceCodeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Device Code Error: ${data.error_description || data.error}`);
  }

  console.log("\n====================================================");
  console.log("🔐 ACTION REQUIRED: ENTER DEVICE CODE TO SIGN IN");
  console.log("====================================================");
  console.log(`1. Open your browser and navigate to: 👉 ${data.verification_uri}`);
  console.log(`2. Enter Code: 🔑 ${data.user_code}`);
  console.log("====================================================\n");
  console.log("⏳ Waiting for user login completion in browser...");

  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const interval = (data.interval || 5) * 1000;
  const expiresAt = Date.now() + data.expires_in * 1000;

  while (Date.now() < expiresAt) {
    await new Promise(resolve => setTimeout(resolve, interval));

    const pollParams = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: CLIENT_ID,
      device_code: data.device_code,
    });

    const pollRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: pollParams.toString(),
    });

    const pollData = await pollRes.json();
    if (pollRes.ok) {
      console.log("✅ Device authentication successful!\n");
      return pollData;
    }

    if (pollData.error === 'authorization_pending') {
      process.stdout.write('.');
      continue;
    } else if (pollData.error === 'slow_down') {
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      throw new Error(`Device Authentication Failed: ${pollData.error_description || pollData.error}`);
    }
  }

  throw new Error("Device Code authentication timed out.");
}

// Password Auth Flow
async function getDelegatedTokenViaPasswordData(scope) {
  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: CLIENT_ID,
    username: USER_EMAIL,
    password: USER_PASSWORD,
    scope: scope,
  });

  if (CLIENT_SECRET) {
    params.append('client_secret', CLIENT_SECRET);
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Password Auth Error: ${data.error_description || data.error}`);
  }
  return data;
}

// Master Helper to obtain access token (from cache, refresh token, or new login)
async function getAccessToken(scope) {
  // 1. Check disk cache
  const cached = loadTokenCache();
  if (cached) {
    if (cached.access_token && cached.expires_at > Date.now()) {
      console.log("⚡ Loaded valid Access Token from local cache (No sign in needed!)\n");
      return cached.access_token;
    }

    if (cached.refresh_token) {
      try {
        return await refreshAccessToken(cached.refresh_token, scope);
      } catch (err) {
        console.warn("⚠️ Silent refresh failed, re-authenticating...", err.message);
      }
    }
  }

  // 2. Perform fresh login & cache the tokens
  let tokenData;
  if (USER_EMAIL && USER_PASSWORD) {
    console.log("🔑 Using User Password credentials from .env for non-interactive auth...");
    tokenData = await getDelegatedTokenViaPasswordData(scope);
  } else {
    tokenData = await getDelegatedTokenViaDeviceCodeData(scope);
  }

  saveTokenCache(tokenData);
  return tokenData.access_token;
}

async function runDiagnostic() {
  validateConfig();

  console.log("====================================================");
  console.log("🔍 SHAREPOINT & ENTRA ID DELEGATED AUTH DIAGNOSTIC");
  console.log("====================================================");
  console.log(`Tenant ID: ${TENANT_ID}`);
  console.log(`Client ID: ${CLIENT_ID}`);
  console.log(`SharePoint Site: ${SHAREPOINT_SITE_URL}`);
  console.log(`Document Library: ${DOCUMENT_LIBRARY_PATH}`);
  console.log("====================================================\n");

  const spScope = `https://${SHAREPOINT_DOMAIN}/AllSites.FullControl offline_access User.Read`;

  let accessToken = null;

  try {
    accessToken = await getAccessToken(spScope);
  } catch (err) {
    console.error(`❌ Authentication Failed: ${err.message}`);
    return;
  }

  const decodedToken = parseJwt(accessToken);
  if (decodedToken) {
    console.log("📋 TOKEN DIAGNOSTIC INFO:");
    console.log("   - User Principal Name (upn/unique_name):", decodedToken.upn || decodedToken.unique_name || decodedToken.preferred_username || "N/A");
    console.log("   - Scope (scp):", decodedToken.scp || "N/A");
    console.log("   - Audience (aud):", decodedToken.aud);
    console.log("   - Tenant ID (tid):", decodedToken.tid);
  }

  // Query SharePoint REST API
  console.log("\n🌐 Step 1: Querying SharePoint REST API with Delegated Token...");
  const folderPathClean = encodeURIComponent(DOCUMENT_LIBRARY_PATH).replace(/%2F/g, '/');
  const endpoint = `${SHAREPOINT_SITE_URL}/_api/web/GetFolderByServerRelativeUrl('${folderPathClean}')/Folders?$select=Name,ServerRelativeUrl,ItemCount&$filter=Name ne 'Forms'`;
  console.log(`   GET ${endpoint}`);

  try {
    const spRes = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json;odata=nometadata',
      },
    });

    if (spRes.ok) {
      const spData = await spRes.json();
      const folders = spData.value || [];
      console.log("\n====================================================");
      console.log(`✅ SUCCESS! FETCHED ${folders.length} PROJECT FOLDERS FROM SHAREPOINT:`);
      console.log("====================================================");
      folders.forEach((folder, i) => {
        console.log(`${i + 1}. [Project Number]: "${folder.Name}"`);
        console.log(`   Server Relative Path: ${folder.ServerRelativeUrl}`);
        console.log(`   Items inside folder: ${folder.ItemCount}`);
      });
      return;
    } else {
      const errText = await spRes.text();
      console.error(`❌ SharePoint REST API HTTP ${spRes.status} (${spRes.statusText}):\n${errText}`);
    }
  } catch (err) {
    console.error(`❌ SharePoint REST Fetch Error: ${err.message}`);
  }

  // Step 2: Microsoft Graph API Fallback
  console.log("\n🌐 Step 2: Attempting Microsoft Graph API as fallback...");
  try {
    const graphToken = await getAccessToken("https://graph.microsoft.com/Files.Read.All User.Read offline_access");
    const siteGraphUrl = `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_DOMAIN}:${SITE_PATH}:/drives`;
    
    const graphRes = await fetch(siteGraphUrl, {
      headers: { Authorization: `Bearer ${graphToken}` },
    });

    if (graphRes.ok) {
      const drivesData = await graphRes.json();
      const libraryName = path.basename(DOCUMENT_LIBRARY_PATH);
      const targetDrive = drivesData.value?.find(d => d.name.toLowerCase() === libraryName.toLowerCase()) || drivesData.value?.[0];

      if (targetDrive) {
        console.log(`   ✅ Drive Found: "${targetDrive.name}" (ID: ${targetDrive.id})`);
        const itemsUrl = `https://graph.microsoft.com/v1.0/drives/${targetDrive.id}/root/children`;
        const itemsRes = await fetch(itemsUrl, {
          headers: { Authorization: `Bearer ${graphToken}` },
        });

        if (itemsRes.ok) {
          const itemsData = await itemsRes.json();
          const folders = (itemsData.value || []).filter(item => item.folder);
          console.log("\n====================================================");
          console.log(`📁 FOLDERS FOUND VIA GRAPH API (${folders.length}):`);
          console.log("====================================================");
          folders.forEach((folder, i) => {
            console.log(`${i + 1}. [Project]: "${folder.name}"`);
            console.log(`   Web URL: ${folder.webUrl}`);
          });
        }
      }
    } else {
      const errText = await graphRes.text();
      console.log(`   ❌ Graph API HTTP ${graphRes.status}: ${errText}`);
    }
  } catch (err) {
    console.log(`   ❌ Graph Error: ${err.message}`);
  }
}

// Exported function to fetch documents inside a specific folder with MSN metadata
export async function getFolderDocuments(folderPath) {
  validateConfig();
  const spScope = `https://${SHAREPOINT_DOMAIN}/AllSites.FullControl offline_access User.Read`;
  const accessToken = await getAccessToken(spScope);

  const folderPathClean = encodeURIComponent(folderPath).replace(/%2F/g, '/');
  // Query Files in folder and expand ListItemAllFields to get custom column metadata (MSN Number)
  const endpoint = `${SHAREPOINT_SITE_URL}/_api/web/GetFolderByServerRelativeUrl('${folderPathClean}')/Files?$select=Name,ServerRelativeUrl,TimeCreated,TimeLastModified,Length,ListItemAllFields/MSNNumber,ListItemAllFields/MSN_x0020_Number,ListItemAllFields/MSN,ListItemAllFields/Title&$expand=ListItemAllFields`;

  console.log(`🌐 [Backend API] Querying Documents in Folder: GET ${endpoint}`);
  const spRes = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json;odata=nometadata',
    },
  });

  if (spRes.ok) {
    const spData = await spRes.json();
    const files = spData.value || [];
    return files.map(file => {
      const item = file.ListItemAllFields || {};
      // Extract MSN Number column (checking possible field internal names)
      const msnNumber = item.MSNNumber || item.MSN_x0020_Number || item.MSN || item.Title || 'N/A';
      return {
        Name: file.Name,
        ServerRelativeUrl: file.ServerRelativeUrl,
        Length: file.Length,
        TimeCreated: file.TimeCreated || file.TimeLastModified,
        TimeLastModified: file.TimeLastModified,
        MSNNumber: msnNumber,
        RawFields: item // Useful for debugging field names
      };
    });
  } else {
    const errText = await spRes.text();
    throw new Error(`SharePoint API HTTP ${spRes.status}: ${errText}`);
  }
}

// Exported function to create a new item in SharePoint list "DIN Requests"
export async function createDinRequest(msnNumber) {
  validateConfig();
  const spScope = `https://${SHAREPOINT_DOMAIN}/AllSites.FullControl offline_access User.Read`;
  const accessToken = await getAccessToken(spScope);

  const endpoint = `${SHAREPOINT_SITE_URL}/_api/web/lists/getByTitle('DIN Requests')/items`;

  console.log(`🌐 [Backend API] Creating DIN Request in SharePoint: POST ${endpoint}`);
  const spRes = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
    },
    body: JSON.stringify({
      Title: msnNumber,
      Status: 'Pending',
    }),
  });

  if (spRes.ok) {
    const itemData = await spRes.json();
    return itemData;
  } else {
    const errText = await spRes.text();
    throw new Error(`SharePoint List API HTTP ${spRes.status}: ${errText}`);
  }
}

// Exported function to check status of a DIN Request item in SharePoint
export async function getDinRequestStatus(itemId) {
  validateConfig();
  const spScope = `https://${SHAREPOINT_DOMAIN}/AllSites.FullControl offline_access User.Read`;
  const accessToken = await getAccessToken(spScope);

  const endpoint = `${SHAREPOINT_SITE_URL}/_api/web/lists/getByTitle('DIN Requests')/items(${itemId})?$select=Id,Title,Status`;

  const spRes = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json;odata=nometadata',
    },
  });

  if (!spRes.ok) {
    const errText = await spRes.text();
    throw new Error(`SharePoint List API HTTP ${spRes.status}: ${errText}`);
  }

  return await spRes.json();
}

// Exported function to fetch the latest generated DIN PDF from "DIN pdfs" library as Base64 Data URL
export async function getLatestDinPdfDataUrl(msnNumber) {
  validateConfig();
  const spScope = `https://${SHAREPOINT_DOMAIN}/AllSites.FullControl offline_access User.Read`;
  const accessToken = await getAccessToken(spScope);

  const libraryPathClean = encodeURIComponent(`${SITE_PATH}/DIN pdfs`).replace(/%2F/g, '/');
  const endpoint = `${SHAREPOINT_SITE_URL}/_api/web/GetFolderByServerRelativeUrl('${libraryPathClean}')/Files?$select=Name,ServerRelativeUrl,TimeCreated, TimeLastModified,Length`;

  console.log(`🌐 [Backend API] Querying DIN PDFs for MSN "${msnNumber}": GET ${endpoint}`);
  const spRes = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json;odata=nometadata',
    },
  });

  if (!spRes.ok) {
    const errText = await spRes.text();
    throw new Error(`SharePoint API HTTP ${spRes.status}: ${errText}`);
  }

  const spData = await spRes.json();
  const files = spData.value || [];

  // Filter files matching the MSN Number and sort strictly by TimeCreated descending (newest first)
  const matchingFiles = files
    .filter(file => file.Name.toLowerCase().includes(msnNumber.toLowerCase()))
    .sort((a, b) => new Date(b.TimeCreated || b.TimeLastModified) - new Date(a.TimeCreated || a.TimeLastModified));

  if (matchingFiles.length === 0) {
    throw new Error(`No generated DIN PDF found in "DIN pdfs" library for MSN: ${msnNumber}`);
  }

  const latestFile = matchingFiles[0];
  console.log(`✅ Latest DIN PDF found: "${latestFile.Name}" (Created Date: ${latestFile.TimeCreated})`);

  // Fetch raw PDF binary content from SharePoint
  const fileUrlClean = encodeURIComponent(latestFile.ServerRelativeUrl).replace(/%2F/g, '/');
  const binaryRes = await fetch(`${SHAREPOINT_SITE_URL}/_api/web/GetFileByServerRelativeUrl('${fileUrlClean}')/$value`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!binaryRes.ok) {
    throw new Error(`Failed to download PDF binary from SharePoint (HTTP ${binaryRes.status})`);
  }

  const arrayBuffer = await binaryRes.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');

  return {
    name: latestFile.Name,
    timeCreated: latestFile.TimeLastModified,
    dataUrl: `data:application/pdf;base64,${base64}`
  };
}

// Exported function to upload a document binary to SharePoint & tag its column metadata
export async function uploadDocumentToSharePoint({ folderUrl, fileName, fileBuffer, metadata = {} }) {
  validateConfig();
  const spScope = `https://${SHAREPOINT_DOMAIN}/AllSites.FullControl offline_access User.Read`;
  const accessToken = await getAccessToken(spScope);

  const folderPathClean = encodeURIComponent(folderUrl).replace(/%2F/g, '/');
  const fileNameClean = encodeURIComponent(fileName);

  // ──── Phase 1: Upload File Binary Payload ────
  const uploadEndpoint = `${SHAREPOINT_SITE_URL}/_api/web/GetFolderByServerRelativeUrl('${folderPathClean}')/Files/add(url='${fileNameClean}',overwrite=true)`;

  console.log(`🌐 [Backend API] Step 1: Uploading File Binary to SharePoint: POST ${uploadEndpoint}`);
  const uploadRes = await fetch(uploadEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json;odata=nometadata',
      'Content-Type': 'application/octet-stream',
    },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    console.error(`❌ SharePoint File Binary Upload Error (HTTP ${uploadRes.status}):`, errText);
    throw new Error(`SharePoint Binary Upload Failed: HTTP ${uploadRes.status} - ${errText}`);
  }

  const fileData = await uploadRes.json().catch(() => ({}));
  console.log(`✅ Step 1 Complete: File binary uploaded successfully! ServerRelativeUrl: ${fileData.ServerRelativeUrl || folderUrl + '/' + fileName}`);

  // ──── Phase 2: Tag Column Metadata via validateUpdateListItem ────
  const fileServerPath = fileData.ServerRelativeUrl || `${folderUrl}/${fileName}`;
  const filePathClean = encodeURIComponent(fileServerPath).replace(/%2F/g, '/');
  const metadataEndpoint = `${SHAREPOINT_SITE_URL}/_api/web/GetFileByServerRelativeUrl('${filePathClean}')/ListItemAllFields/validateUpdateListItem`;

  // Mapping SharePoint Internal Column Names to Metadata
  const formValues = [
    { FieldName: 'MSN_x0020_Number', FieldValue: String(metadata.msnNumber || '') },
    { FieldName: 'Document_x0020_Number', FieldValue: String(metadata.docNumber || '') },
    { FieldName: 'Document_x0020_Type', FieldValue: String(metadata.docType || '') },
    { FieldName: 'Record_x0020_of_x0020_revisions', FieldValue: String(metadata.revisionNumber || '') }
  ];

  console.log(`🌐 [Backend API] Step 2: Tagging Column Metadata: POST ${metadataEndpoint}`);
  const metadataRes = await fetch(metadataEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json;odata=nometadata',
      Accept: 'application/json;odata=nometadata',
    },
    body: JSON.stringify({
      formValues: formValues,
      bNewDocumentUpdate: true
    }),
  });

  if (!metadataRes.ok) {
    const errText = await metadataRes.text();
    console.error(`⚠️ SharePoint Metadata Tagging Error (HTTP ${metadataRes.status}):`, errText);
    throw new Error(`SharePoint Metadata Tagging Failed: HTTP ${metadataRes.status} - ${errText}`);
  }

  const metadataResult = await metadataRes.json().catch(() => ({}));
  console.log(`📋 SharePoint validateUpdateListItem Results:`, JSON.stringify(metadataResult, null, 2));

  // Check if any field failed
  const itemResults = metadataResult.value || [];
  const errors = itemResults.filter(item => item.HasException);
  if (errors.length > 0) {
    console.warn(`⚠️ Some metadata fields could not be updated:`, errors.map(e => `${e.FieldName}: ${e.ErrorMessage}`).join(' | '));
  } else {
    console.log(`✅ Step 2 Complete: Metadata tagged successfully on SharePoint item!`);
  }

  return {
    success: true,
    fileName: fileName,
    serverRelativeUrl: fileServerPath,
    metadataResult: metadataResult
  };
}

// Exported function to be used by server.js / API endpoints
export async function getProjectFolders() {
  validateConfig();
  const spScope = `https://${SHAREPOINT_DOMAIN}/AllSites.FullControl offline_access User.Read`;
  const accessToken = await getAccessToken(spScope);

  const folderPathClean = encodeURIComponent(DOCUMENT_LIBRARY_PATH).replace(/%2F/g, '/');
  const endpoint = `${SHAREPOINT_SITE_URL}/_api/web/GetFolderByServerRelativeUrl('${folderPathClean}')/Folders?$select=Name,ServerRelativeUrl,ItemCount&$filter=Name ne 'Forms'`;

  console.log(`🌐 [Backend API] Querying SharePoint: GET ${endpoint}`);
  const spRes = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json;odata=nometadata',
    },
  });

  if (spRes.ok) {
    const spData = await spRes.json();
    return spData.value || [];
  } else {
    const errText = await spRes.text();
    throw new Error(`SharePoint API HTTP ${spRes.status}: ${errText}`);
  }
}

// Diagnostic CLI runner
if (process.argv[1] && process.argv[1].endsWith('fetchProjects.js')) {
  runDiagnostic();
}


