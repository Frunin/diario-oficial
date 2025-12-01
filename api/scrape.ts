import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

// Helper to determine if we are running locally
const isLocal = !process.env.AWS_REGION && !process.env.VERCEL_REGION;

export const config = {
  runtime: 'nodejs',
  maxDuration: 60, // Allow 60 seconds for browser interactions
};

export default async function handler(request, response) {
  // CORS Headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  // Parse URL from query string
  const protocol = request.headers['x-forwarded-proto'] || 'http';
  const host = request.headers.host;
  const fullUrl = new URL(request.url, `${protocol}://${host}`);
  const targetUrl = fullUrl.searchParams.get('url');

  if (!targetUrl) {
    response.status(400).json({ error: 'URL parameter is required' });
    return;
  }

  let browser = null;

  try {
    let executablePath = null;
    
    if (isLocal) {
        // Local development: Try to find Chrome on the system
        const platforms = {
            win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            linux: '/usr/bin/google-chrome',
            darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        };
        executablePath = platforms[process.platform] || '';
        console.log("Running in Local Mode. Looking for Chrome at:", executablePath);
    } else {
        // Production (Vercel): Use the Lambda layer
        executablePath = await chromium.executablePath();
    }

    browser = await puppeteer.launch({
      args: isLocal ? puppeteer.defaultArgs() : chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: executablePath || undefined,
      headless: isLocal ? false : chromium.headless, // Run visible locally for debugging
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    
    // Set a realistic User-Agent to bypass basic bot detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    
    // Set extra headers
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    });

    // Navigate to the target URL
    await page.goto(targetUrl, { 
      waitUntil: 'networkidle2', // Wait until network is quiet
      timeout: 30000 
    });

    // Check if we hit a firewall/captcha page
    const title = await page.title();
    if (title.includes("403") || title.includes("Forbidden") || title.includes("Access Denied")) {
        throw new Error("403_FORBIDDEN_BY_PAGE_TITLE");
    }

    // Wait for the specific container known to hold the gazette records
    try {
        await page.waitForSelector('#conteudo_generico_1014', { timeout: 5000 });
    } catch (e) {
        console.warn("Target selector #conteudo_generico_1014 not found. Returning full page HTML.");
    }

    const html = await page.content();

    response.status(200).json({ success: true, html });

  } catch (error) {
    console.error('Puppeteer Error:', error);
    response.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown Puppeteer error' 
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}