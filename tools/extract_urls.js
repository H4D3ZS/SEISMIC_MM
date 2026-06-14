import fs from 'fs';

try {
  const filePath = 'C:\\Users\\HADES\\.gemini\\antigravity-ide\\brain\\c3154b4d-cc58-41d3-ae53-fdfea79584f7\\.system_generated\\steps\\259\\content.md';
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Extract all URLs matching http or https
  const urlRegex = /https?:\/\/[^\s"'<>]+/g;
  const urls = content.match(urlRegex) || [];
  
  // Also scan for API endpoints or strings containing '/' that look like paths
  const apiPaths = [];
  const stringRegex = /"([^"]+)"|'([^']+)'/g;
  let match;
  while ((match = stringRegex.exec(content)) !== null) {
    const str = match[1] || match[2];
    if (str && (str.startsWith('/') || str.includes('api/') || str.includes('earthquake') || str.includes('phivolcs') || str.includes('usgs'))) {
      if (str.length < 100) {
        apiPaths.push(str);
      }
    }
  }

  console.log('--- FOUND URLS ---');
  console.log(JSON.stringify(Array.from(new Set(urls)), null, 2));
  console.log('\n--- FOUND KEY STRINGS / PATHS ---');
  console.log(JSON.stringify(Array.from(new Set(apiPaths)).slice(0, 100), null, 2));

} catch (err) {
  console.error('Error running script:', err);
}
