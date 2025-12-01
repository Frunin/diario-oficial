import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export const config = {
  runtime: 'nodejs',
  maxDuration: 60, 
};

// Fallback fetch function if Puppeteer fails
async function fetchFallback(url: string) {
    console.log("[Fallback] Puppeteer failed, attempting standard fetch...");
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
        }
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Fallback Fetch Failed: ${response.status} ${response.statusText}`);
    }

    return await response.text();
}

export default async function handler(request: any, response: any) {
  // CORS Headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
    response.status(400).json({ error: 'URL parameter is required' });
    return;
  }

  let browser = null;

  try {
    const isLocal = !process.env.AWS_REGION && !process.env.VERCEL_REGION;
    
    // Configure Chromium executable path
    let executablePath = "";
    if (isLocal) {
        if (process.platform === 'win32') {
            executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        } else if (process.platform === 'darwin') {
            executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        } else {
            executablePath = '/usr/bin/google-chrome';
        }
    } else {
        // Standard Vercel/AWS environment path resolution
        executablePath = await chromium.executablePath();
    }

    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process', // Important for serverless
        '--no-zygote'
      ],
      defaultViewport: { width: 1920, height: 1080 },
      executablePath: executablePath,
      headless: isLocal ? false : true,
      ignoreHTTPSErrors: true,
    } as any);

    const page = await browser.newPage();
    
    // Spoof User Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    });

    await page.goto(targetUrl, { 
      waitUntil: 'domcontentloaded', 
      timeout: 25000 
    });

    // Simple 403 check
    const title = await page.title();
    if (title.includes("403") || title.includes("Forbidden") || title.includes("Access Denied")) {
        throw new Error("403_FORBIDDEN_DETECTED_IN_PUPPETEER");
    }

    // Attempt to wait for content, but allow fallback if selector is missing
    try {
        await page.waitForSelector('#conteudo_generico_1014', { timeout: 5000 });
    } catch (e) {
        // Selector not found, proceeding with raw content
    }

    const html = await page.content();
    response.status(200).json({ success: true, html });

  } catch (error) {
    console.error('Puppeteer Error:', error);
    
    try {
        const html = await fetchFallback(targetUrl);
        response.status(200).json({ success: true, html, note: "Served via Fallback Fetch" });
    } catch (fallbackError) {
        console.error('Fallback Error:', fallbackError);
        response.status(500).json({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error',
            details: "Puppeteer and Fallback both failed."
        });
    }

  } finally {
    if (browser) {
      await browser.close().catch(e => console.error("Error closing browser", e));
    }
  }
}