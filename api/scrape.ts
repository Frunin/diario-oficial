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

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch site: ${response.status} ${response.statusText}`);
    }
    
    // We get the text. Note: If the site uses legacy encodings (ISO-8859-1), 
    // fetch usually handles it if the server sends the correct Content-Type header.
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