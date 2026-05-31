// export_reports_recursive.js - FINAL UPDATED for Response Headers and Iran Time

const fs = require('fs');

// --- Routes ---
const path = require('path');

const PROJECT_ID = process.env.APIDOG_PROJECT_ID || '767820';

const baseDir = path.join(
    process.env.HOME,
    '.config',
    'apidog',
    'apidog-data',
    `project-${PROJECT_ID}`,
    'apiTestReport'
);

const outputDir = process.env.APIDOG_OUTPUT_DIR ||
    path.join(process.env.HOME, 'Documents', 'ApiDogTestingReport');
const mergedJsonPath = path.join(outputDir, 'merged_report.json');
const outputHtmlPath = path.join(outputDir, 'apidog_report_summary.html');

function ensureOutDir() {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
}

function walkDir(dir) {
  // Return a list of all files
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    try {
      if (ent.isDirectory()) {
        results.push(...walkDir(full));
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.json')) {
        results.push(full);
      }
    } catch (e) {
      console.error('walk error for', full, e.message);
    }
  }
  return results;
}

function safeParseJson(filePath) {
  try {
    const txt = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    console.error('JSON parse error:', filePath, e.message);
    return null;
  }
}

// --- Function: Generate cURL command from request data ---
function generateCurlCommand(data) {
    const request = data?.request;
    if (!request || !request.method || !request.url) return '';

    let curl = `curl --location --request ${request.method} '${request.url}'`;
    
    // Add headers
    const headers = request.header || [];
    for (const header of headers) {
        if (header.system || header.key.toLowerCase() === 'host' || header.key.toLowerCase() === 'connection') {
            continue;
        }
        curl += ` \\\n  --header '${header.key}: ${header.value.replace(/'/g, '\\\'')}'`;
    }

    // Add body
    const body = request.body;
    if (body) {
        let bodyContent = null;
        if (body.raw) {
            bodyContent = body.raw;
        } else if (body.formData) {
            try {
                bodyContent = JSON.stringify(body.formData, null, 2);
            } catch (e) {
                // Ignore
            }
        }
        
        if (bodyContent) {
            const escapedBody = bodyContent.replace(/'/g, '\\\'');
            curl += ` \\\n  --data-raw $'${escapedBody}'`;
        }
    }

    return curl;
}

function extractInfoFromReport(data, filePath) {
  const info = {};
  info._sourceFile = filePath;
  info.name = data?.name || data?.metaInfo?.httpApiName || (data?.request && (data.request.href || data.request.url)) || 'unknown';
  info.method = data?.request?.method || (data?.metaInfo?.httpApiMethod) || 'N/A';
  info.url = data?.request?.url || data?.metaInfo?.httpApiPath || (data?.request && data.request.href) || 'N/A';
  info.status = (data?.response?.code || data?.response?.status || data?.response?.statusCode) || 'N/A';
  
  //  Preserve original timestamp for conversion in makeHtml
  info.timestamp = data?.timings?.started ? new Date(data.timings.started).toISOString() : (data?.time || null);
  
  // --- Generate cURL command ---
  info.curl = generateCurlCommand(data);

  // --- Extracting the Response Body ---
  let responseBody = null;
  if (data?.response?.body) {
    responseBody = data.response.body;
  } else if (data?.response?.stream && data.response.stream.data) {
    try {
      const buf = Buffer.from(data.response.stream.data);
      responseBody = buf.toString('utf8');
      try { responseBody = JSON.parse(responseBody); } catch (_) {}
    } catch (e) {
      try { responseBody = Buffer.from(data.response.stream.data).toString('utf8'); } catch(e2){ responseBody = null; }
    }
  } else if (data?.response?.bodyText) {
    responseBody = data.response.bodyText;
  }
  info.responseBody = responseBody; 
  
  // --- Extracting Request Body ---
  let requestBody = null;
  if (data?.request?.body?.raw) {
    requestBody = data.request.body.raw;
    try { requestBody = JSON.parse(requestBody); } catch (_) {}
  } else if (data?.request?.body?.formData) {
    requestBody = data.request.body.formData;
  } else if (data?.request?.body && typeof data.request.body === 'object') {
     requestBody = data.request.body;
  }
  info.requestBody = requestBody;
  
  // --- Extract and convert Response Headers ---
  let responseHeaders = data?.response?.header;
  if (Array.isArray(responseHeaders)) {
      info.responseHeaders = responseHeaders.reduce((acc, h) => {
          acc[h.key] = h.value;
          return acc;
      }, {});
  } else {
      info.responseHeaders = {};
  }
  
  return info;
}

function makeHtml(merged) {
  let html = `
  <html>
  <head>
    <meta charset="utf-8"/>
    <title>ApiDog Testing Report Summary</title>
    <style>
      body { font-family: Tahoma, Arial, Helvetica, sans-serif; background:#0f0f11; color:#e6e6e6; padding:20px; direction: rtl; text-align: right; }
      table { border-collapse: collapse; width: 100%; table-layout: fixed; direction: ltr; }
      th, td { border: 1px solid #333; padding: 8px; vertical-align: top; font-size: 0.9em; direction: ltr; text-align: left; }
      th { background: #111; position: sticky; top:0; z-index: 10; text-align: center; }
      tr:nth-child(even) { background: #0d0d0f; }
      
      /* Adjusting the size of columns */
      td:nth-child(1), th:nth-child(1) { width: 2%; text-align: center; } /* row */
      td:nth-child(2), th:nth-child(2) { width: 3%; text-align: center; } /* method */
      td:nth-child(4), th:nth-child(4) { width: 3%; text-align: center; } /* status */
      td:nth-child(5), th:nth-child(5) { width: 8%; text-align: center; } /* time (Iran)*/
      
      pre { white-space: pre-wrap; word-break: break-all; max-height: 250px; overflow: auto; color: #bfe7bf; background: #071007; padding: 8px; border-radius:4px; font-family: monospace; font-size: 0.8em; }
      .small { font-size: 0.7em; color:#9aa0a6; word-break: break-all; }
      .url-cell { max-width: 200px; word-break: break-all; font-size: 0.85em; }
      .curl-pre { color: #8dd0ff; background: #0c0c16; white-space: pre-wrap; }
      .header-pre { max-height: 150px; }
    </style>
  </head>
  <body dir="rtl">
    <h1 dir="rtl">ApiDog Test Report Summary (Full Content)</h1>
    <p class="small" dir="rtl">Report generation time: ${new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' })}</p>
    <table>
      <thead>
        <tr><th>Row</th><th>Method</th><th>URL</th><th>Status</th><th>Time (TehranZone)</th><th>Request Body</th><th>cURL Command</th><th>Response Header</th><th>Response Body</th></tr>
      </thead>
      <tbody>
  `;
  merged.forEach((it, idx) => {
    // --- Time formatting based on Iran's time zone ---
    const timestamp = it.timestamp ? new Date(it.timestamp) : null;
    const readableTime = timestamp ? timestamp.toLocaleString('fa-IR', { 
        timeZone: 'Asia/Tehran',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    }) : 'N/A';

    // --- Processing Response Body ---
    const responseBodyText = typeof it.responseBody === 'string' ? it.responseBody : (it.responseBody ? JSON.stringify(it.responseBody, null, 2) : '');
    
    // --- Request Body Processing ---
    const requestBodyText = typeof it.requestBody === 'string' ? it.requestBody : (it.requestBody ? JSON.stringify(it.requestBody, null, 2) : '');
    
    // --- Show cURL command ---
    const curlCommandText = it.curl || 'N/A';

    // --- Display Response Headers ---
    const responseHeadersText = it.responseHeaders ? JSON.stringify(it.responseHeaders, null, 2) : 'N/A';
    
    html += `<tr>
      <td>${idx+1}</td>

      <td>${escapeHtml(String(it.method || ''))}</td>
      <td class="url-cell">${escapeHtml(String(it.url || ''))}</td>
      <td>${escapeHtml(String(it.status || ''))}</td>
      <td>${escapeHtml(readableTime)}</td>
      <td><pre class="header-pre">${escapeHtml(requestBodyText || 'N/A')}</pre></td>
      <td><pre class="curl-pre header-pre">${escapeHtml(curlCommandText)}</pre></td>
      <td><pre class="header-pre">${escapeHtml(responseHeadersText)}</pre></td>
      <td><pre class="header-pre">${escapeHtml(responseBodyText || 'N/A')}</pre></td>
    </tr>`;
  });
  html += `</tbody></table></body></html>`;
  return html;
}

function escapeHtml(s) {
  s = String(s || ''); 
  return s.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function main() {
  try {
    console.log('Base dir:', baseDir);
    if (!fs.existsSync(baseDir)) {
      console.error('❌ Base apiTestReport folder not found:', baseDir);
      process.exit(1);
    }
    ensureOutDir();

    const jsonFiles = walkDir(baseDir);
    console.log('Found json files count:', jsonFiles.length);
    if (jsonFiles.length === 0) {
      console.error('❌ No .json files found inside the base dir. Check subfolders structure.');
      process.exit(1);
    }

    const merged = [];
    for (const jf of jsonFiles) {
      const data = safeParseJson(jf);
      if (!data) continue;
      const info = extractInfoFromReport(data, jf);
      merged.push(info);
    }
    
    // ====================================================================
    // --- New step: Sort the array from newest to oldest (descending) ---
    merged.sort((a, b) => {
        const dateA = new Date(a.timestamp);
        const dateB = new Date(b.timestamp);
        // Sort descending (newest to oldest): dateB - dateA
        return dateA - dateB;
    });
    // ====================================================================

    fs.writeFileSync(mergedJsonPath, JSON.stringify(merged, null, 2), 'utf8');
    console.log('✅ merged JSON saved to', mergedJsonPath);

    const html = makeHtml(merged);
    fs.writeFileSync(outputHtmlPath, html, 'utf8');
    console.log('✅ HTML summary saved to', outputHtmlPath);

  } catch (e) {
    console.error('Unexpected error:', e);
  }
}

main();
