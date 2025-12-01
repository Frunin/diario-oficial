export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response('URL parameter is required', { 
      status: 400,
      headers: corsHeaders 
    });
  }

  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': 'https://saojoaodelrei.mg.gov.br/'
  };

  try {
    // Attempt 1: Direct Fetch
    let response = await fetch(targetUrl, { headers: browserHeaders });

    // Attempt 2: Fallback Proxy (if blocked)
    // corsproxy.io is better for binary/PDF data than allorigins
    if (response.status === 403 || response.status === 401) {
       console.warn(`[ProxyPDF] Direct blocked. Retrying ${targetUrl} via corsproxy.io...`);
       const fallbackUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
       const fallbackResponse = await fetch(fallbackUrl);
       
       if (fallbackResponse.ok) {
           response = fallbackResponse;
       }
    }

    if (!response.ok) {
       return new Response(`Failed to fetch PDF: ${response.status} ${response.statusText}`, { 
         status: response.status,
         headers: corsHeaders
       });
    }

    const pdfBuffer = await response.arrayBuffer();
    
    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=3600',
        ...corsHeaders
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`Internal Server Error: ${msg}`, { 
      status: 500,
      headers: corsHeaders
    });
  }
}