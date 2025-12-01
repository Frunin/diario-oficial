import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export const config = {
  runtime: 'nodejs',
  maxDuration: 60, // Maximum allowed duration on Pro plan (10s on Hobby, but we set higher just in case)
};

export default async function handler(request: any, response: any) {
  // Enable CORS
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
    
    // Determine executable path for Chrome/Chromium
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
        // Vercel / AWS Lambda environment
        executablePath = await chromium.executablePath();
    }

    if (!isLocal) {
       chromium.setGraphicsMode = false;
    }

    // Launch Browser
    browser = await puppeteer.launch({
      args: isLocal ? [] : [...chromium.args, '--disable-gpu', '--disable-dev-shm-usage', '--disable-setuid-sandbox', '--no-sandbox', '--no-zygote'],
      defaultViewport: (chromium as any).defaultViewport,
      executablePath: executablePath,
      headless: isLocal ? false : (chromium as any).headless,
      ignoreHTTPSErrors: true,
    } as any);

    const page = await browser.newPage();
    
    // Spoof User-Agent to look like a real browser
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8' });

    console.log(`[Puppeteer] Navigating to ${targetUrl}...`);

    // Go to the page and wait for the network to be idle (scripts loaded)
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 45000 });

    // VISUAL WAIT: Wait for the actual document list container to appear in the DOM
    // This ensures we are reading the page AFTER the Javascript has built the table.
    try {
        await page.waitForSelector('#contenedor_registro_generico', { visible: true, timeout: 15000 });
    } catch (e) {
        console.log("[Puppeteer] Warning: Specific row selector timeout. Page might be empty or loading slowly.");
    }

    // VISUAL READ: Extract data from the rendered DOM elements
    const extractedDocs = await page.evaluate(() => {
        const docs: any[] = [];
        
        // Find all row elements that are currently rendered on the screen
        const rows = document.querySelectorAll('#contenedor_registro_generico');
        
        rows.forEach((row) => {
            const rowEl = row as HTMLElement;
            
            // 1. Locate the click target to extract the file ID
            // We look for the element that the user would click to download the file.
            // On this site, it's an element with a specific onclick function.
            const clickTarget = rowEl.querySelector('[onclick*="obterArquivoCadastroGenerico"]');
            
            if (!clickTarget) return;

            // Extract the ID from the function call "obterArquivoCadastroGenerico(1234)"
            const onclickAttr = clickTarget.getAttribute('onclick');
            const idMatch = onclickAttr?.match(/(\d+)/);
            if (!idMatch) return;
            const id = idMatch[1];

            // 2. Read the VISIBLE text content of the row
            // innerText gets the text as rendered (respecting styling), which is safer than parsing innerHTML.
            const visibleText = rowEl.innerText;
            
            let publicationDate = "";
            let editionLabel = "";
            let contentSummary = "";

            // Parse the visual lines
            const lines = visibleText.split('\n');
            lines.forEach(line => {
                const cleanLine = line.trim();
                const lowerLine = cleanLine.toLowerCase();
                
                if (lowerLine.startsWith('data') && lowerLine.includes(':')) {
                    publicationDate = cleanLine.split(':')[1].trim();
                } else if (lowerLine.startsWith('edição') && lowerLine.includes(':')) {
                    editionLabel = cleanLine; 
                } else if (lowerLine.startsWith('resumo') && lowerLine.includes(':')) {
                    contentSummary = cleanLine.split(':')[1].trim();
                }
            });

            // If summary was not found via label, use any remaining long text
            if (!contentSummary) {
                const potentialSummary = lines.find(l => l.length > 30 && !l.toLowerCase().includes('data') && !l.toLowerCase().includes('edição'));
                if (potentialSummary) contentSummary = potentialSummary.trim();
            }

            // Build the final object
            docs.push({
                id,
                // Construct the PDF URL based on the found ID
                url: `https://saojoaodelrei.mg.gov.br/Obter_Arquivo_Cadastro_Generico.php?INT_ARQ=${id}&LG_ADM=undefined`,
                publicationDate,
                editionLabel,
                contentSummary: contentSummary || "Sem resumo disponível no site.",
                title: editionLabel || `Diário Oficial (ID: ${id})`
            });
        });
        
        return docs;
    });

    console.log(`[Puppeteer] Found ${extractedDocs.length} documents.`);

    response.status(200).json({ 
        success: true, 
        mode: 'json', 
        data: extractedDocs 
    });

  } catch (error: any) {
    console.error('[Puppeteer] Error:', error.message);
    response.status(500).json({ 
        success: false, 
        error: error.message,
        details: "Visual scraping failed."
    });
  } finally {
    if (browser) {
      await browser.close().catch(e => console.error("Error closing browser", e));
    }
  }
}