export const config = {
  runtime: 'nodejs', // Node.js runtime required for buffer handling
};

export default async function handler(request, response) {
  // CORS Headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  const protocol = request.headers['x-forwarded-proto'] || 'http';
  const host = request.headers.host;
  const fullUrl = new URL(request.url, `${protocol}://${host}`);
  const targetUrl = fullUrl.searchParams.get('url');

  if (!targetUrl) {
    response.status(400).send('URL parameter is required');
    return;
  }

  try {
    // Attempt direct fetch with browser-like headers
    const fetchResponse = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,application/octet-stream,*/*',
        'Referer': 'https://saojoaodelrei.mg.gov.br/',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Connection': 'keep-alive'
      }
    });

    if (!fetchResponse.ok) {
        console.warn(`Direct PDF fetch failed (${fetchResponse.status}). Trying fallback...`);
        
        // Fallback: corsproxy.io (Good for bypassing simple header checks)
        const fallbackUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
        const fallbackRes = await fetch(fallbackUrl);
        
        if (fallbackRes.ok) {
            const buffer = await fallbackRes.arrayBuffer();
            response.setHeader('Content-Type', 'application/pdf');
            response.send(Buffer.from(buffer));
            return;
        }

        response.status(fetchResponse.status).send(`Failed to fetch PDF. Direct: ${fetchResponse.statusText}. Fallback: ${fallbackRes.statusText}`);
        return;
    }

    const arrayBuffer = await fetchResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    response.setHeader('Content-Type', 'application/pdf');
    // Cache for 1 hour to reduce load on source
    response.setHeader('Cache-Control', 'public, max-age=3600');
    response.send(buffer);

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('PDF Proxy Error:', msg);
    response.status(500).send(`Internal Server Error: ${msg}`);
  }
}