import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export const config = {
  runtime: 'nodejs',
  maxDuration: 60, 
};

// Robust Fallback: Tries standard fetch, then a public proxy if blocked
async function fetchFallback(url: string) {
    console.log("[Fallback] Puppeteer failed, attempting standard fetch...");
    
    // 1. Try direct fetch with heavy spoofing
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            }
        });

        if (response.ok) {
            return await response.text();
        }
        console.log(`[Fallback] Direct fetch failed: ${response.status}`);
    } catch (e) {
        console.log(`[Fallback] Direct fetch error:`, e);
    }

    // 2. Try AllOrigins Proxy (Bypasses 403 Forbidden on the server side)
    console.log("[Fallback] Attempting via AllOrigins Proxy...");
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const proxyResponse = await fetch(proxyUrl);
    
    if (!proxyResponse.ok) {
        throw new Error(`All fallbacks failed. Proxy Status: ${proxyResponse.status}`);
    }
    
    return await proxyResponse.text();
}

export default async function handler(request: any, response: any) {
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
        // Specific to @sparticuz/chromium 123.x
        executablePath = await chromium.executablePath();
    }

    if (!isLocal) {
       chromium.setGraphicsMode = false;
    }

    browser = await puppeteer.launch({
      args: isLocal ? [] : [...chromium.args, '--disable-gpu', '--disable-dev-shm-usage', '--disable-setuid-sandbox', '--no-sandbox', '--no-zygote'],
      defaultViewport: (chromium as any).defaultViewport,
      executablePath: executablePath,
      headless: isLocal ? false : (chromium as any).headless,
      ignoreHTTPSErrors: true,
    } as any);

    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8' });

    // Open the page
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

    const title = await page.title();
    if (title.includes("403") || title.includes("Forbidden")) {
        throw new Error("403_FORBIDDEN_DETECTED");
    }

    // Wait for the dynamic content to build
    try {
        await page.waitForSelector('#conteudo_generico_1014', { timeout: 5000 });
    } catch (e) {
        console.log("Selector wait timeout - proceeding anyway");
    }

    // EXECUTE PARSING LOGIC INSIDE THE BROWSER
    // This looks for the pattern, caches ID, and builds the URL
    const extractedDocs = await page.evaluate(() => {
        const docs = [];
        const container = document.getElementById('conteudo_generico_1014');
        if (!container) return [];

        const rows = container.querySelectorAll('[id="contenedor_registro_generico"]');
        
        // Helper to clean text
        const clean = (text) => text ? text.replace(/&nbsp;/g, ' ').trim() : '';

        rows.forEach(row => {
            // 1. Extract ID from onclick pattern
            const linkElement = row.querySelector('[onclick*="obterArquivoCadastroGenerico"]');
            if (!linkElement) return;

            const onclickText = linkElement.getAttribute('onclick');
            const idMatch = onclickText && onclickText.match(/obterArquivoCadastroGenerico\s*\(\s*(\d+)\s*\)/);
            
            if (!idMatch || !idMatch[1]) return;
            const id = idMatch[1];

            // 2. Build the Full URL
            const pdfUrl = `https://saojoaodelrei.mg.gov.br/Obter_Arquivo_Cadastro_Generico.php?INT_ARQ=${id}&LG_ADM=undefined`;

            // 3. Extract Metadata
            let publicationDate = '';
            let editionLabel = '';
            let siteSummary = '';

            const infoBlocks = row.querySelectorAll('[id="informacao_generica"]');
            infoBlocks.forEach(block => {
                const titleEl = block.querySelector('[id="titulo_generico"]');
                const valueEl = block.querySelector('[id="valor_generico"]');
                
                if (titleEl && valueEl) {
                    const label = clean(titleEl.textContent).toLowerCase();
                    const value = clean(valueEl.textContent);

                    if (label.includes('data')) publicationDate = value;
                    if (label.includes('edição')) editionLabel = `Edição ${value}`;
                    if (label.includes('resumo')) siteSummary = value;
                }
            });

            // Clean up summary HTML breaks
            siteSummary = siteSummary.replace(/<br\s*\/?>/gi, '\n').trim();

            docs.push({
                id,
                url: pdfUrl,
                publicationDate,
                editionLabel,
                contentSummary: siteSummary,
                title: editionLabel || `Diário Oficial (ID: ${id})`
            });
        });

        return docs;
    });

    response.status(200).json({ 
        success: true, 
        mode: 'json', 
        data: extractedDocs 
    });

  } catch (error: any) {
    console.error('Puppeteer Error:', error.message);
    
    try {
        // If Puppeteer fails, fallback to HTML mode
        // The frontend will have to do the parsing
        const html = await fetchFallback(targetUrl);
        response.status(200).json({ 
            success: true, 
            mode: 'html', 
            html, 
            note: "Served via Fallback (Proxy/Fetch)" 
        });
    } catch (fallbackError: any) {
        console.error('Fallback Error:', fallbackError.message);
        response.status(500).json({ 
            success: false, 
            error: error.message || 'Unknown error',
            details: "Puppeteer and Fallback both failed."
        });
    }

  } finally {
    if (browser) {
      await browser.close().catch(e => console.error("Error closing browser", e));
    }
  }
}