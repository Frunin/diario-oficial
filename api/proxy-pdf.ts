export const config = {
  runtime: 'nodejs',
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
    // Using Node.js built-in fetch (available in Node 18+)
    const fetchResponse = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,application/octet-stream,*/*',
        'Referer': 'https://saojoaodelrei.mg.gov.br/'
      }
    });

    if (!fetchResponse.ok) {
        // Fallback to proxy if direct fetch fails (403/401)
        if (fetchResponse.status === 403 || fetchResponse.status === 401) {
            console.warn(`Direct PDF fetch blocked (${fetchResponse.status}). Trying fallback proxy...`);
            const fallbackUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
            const fallbackRes = await fetch(fallbackUrl);
            
            if (fallbackRes.ok) {
                const buffer = await fallbackRes.arrayBuffer();
                response.setHeader('Content-Type', 'application/pdf');
                response.send(Buffer.from(buffer));
                return;
            }
        }

        response.status(fetchResponse.status).send(`Failed to fetch PDF: ${fetchResponse.statusText}`);
        return;
    }

    const arrayBuffer = await fetchResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Cache-Control', 'public, max-age=3600');
    response.send(buffer);

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('PDF Proxy Error:', msg);
    response.status(500).send(`Internal Server Error: ${msg}`);
  }
}