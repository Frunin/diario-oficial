export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  // Common CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // Handle CORS Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ success: false, error: 'URL parameter is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json', ...corsHeaders }
    });
  }

  // Simplified headers to avoid fingerprinting that might trigger strict firewalls
  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  };

  try {
    // Attempt 1: Direct Fetch
    let response = await fetch(targetUrl, {
      headers: browserHeaders
    });

    // Attempt 2: Fallback Proxy (if blocked by 403 Forbidden or 401 Unauthorized)
    if (response.status === 403 || response.status === 401) {
      console.warn(`[Proxy] Direct access to ${targetUrl} blocked (${response.status}). Retrying via fallback proxy...`);
      
      // We use allorigins.win as it's reliable for text/html content
      const fallbackUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
      
      const fallbackResponse = await fetch(fallbackUrl, {
        headers: {
            'User-Agent': browserHeaders['User-Agent'] // Pass UA to proxy
        }
      });
      
      // If fallback succeeds, use it
      if (fallbackResponse.ok) {
        response = fallbackResponse;
      } else {
        // If fallback also fails, throw the original error or the fallback error
        console.error(`[Proxy] Fallback failed: ${fallbackResponse.status}`);
      }
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch site: ${response.status} ${response.statusText}`);
    }
    
    const html = await response.text();
    
    return new Response(JSON.stringify({ success: true, html }), {
      status: 200,
      headers: { 
        'content-type': 'application/json',
        'Cache-Control': 'no-store',
        ...corsHeaders
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { 'content-type': 'application/json', ...corsHeaders }
    });
  }
}