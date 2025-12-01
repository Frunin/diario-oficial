import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export const config = {
  runtime: 'nodejs',
  maxDuration: 60, // Allow more time for browser launch
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
  // Vercel Node.js handler receives standard IncomingMessage, so we construct URL manually
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
    // Determine executable path: local chrome vs serverless chromium
    let executablePath = await chromium.executablePath();
    
    // Fallback logic for local development (if variable is not set by sparticuz)
    if (!executablePath) {
      // Common paths for Linux/Mac/Win if testing locally without the lambda layer
      // You might need to adjust this if running `vercel dev` locally without sparticuz support
      console.log("Running locally? Chromium path not found, trying defaults."); 
      executablePath = process.platform === 'win32' 
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' 
        : '/usr/bin/google-chrome';
    }

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    
    // Mimic a real user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    // Go to URL
    await page.goto(targetUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 45000 
    });

    // Wait for the container that usually holds the data
    try {
        await page.waitForSelector('#conteudo_generico_1014', { timeout: 10000 });
    } catch (e) {
        console.warn("Selector #conteudo_generico_1014 not found, returning content anyway.");
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