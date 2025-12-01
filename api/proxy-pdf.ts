export const config = {
  runtime: 'nodejs', 
};

export default async function handler(request, response) {
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
    const fetchResponse = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://saojoaodelrei.mg.gov.br/',
      }
    });

    if (!fetchResponse.ok) {
        throw new Error(`Direct fetch failed: ${fetchResponse.status}`);
    }

    const arrayBuffer = await fetchResponse.arrayBuffer();
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Cache-Control', 'public, max-age=3600');
    response.send(Buffer.from(arrayBuffer));

  } catch (error) {
    console.error('PDF Direct Error:', error);
    
    // Proxy Fallback for PDFs
    try {
        const corsProxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
        const fallbackRes = await fetch(corsProxyUrl);
        
        if (fallbackRes.ok) {
            const buffer = await fallbackRes.arrayBuffer();
            response.setHeader('Content-Type', 'application/pdf');
            response.send(Buffer.from(buffer));
            return;
        }
    } catch (e) {
        console.error('PDF Fallback Error:', e);
    }

    response.status(500).send(`Failed to fetch PDF.`);
  }
}