import * as pdfjsLib from 'pdfjs-dist';

// Configure worker to use the same version from the CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://aistudiocdn.com/pdfjs-dist@^5.4.449/build/pdf.worker.min.mjs`;

// Get the API URL from build configuration (see vite.config.ts)
// @ts-ignore
const API_BASE = process.env.SCRAPER_API_URL;

export const extractTextFromPdf = async (targetUrl: string): Promise<string> => {
  // Use Python Server Proxy to fetch the PDF
  // This bypasses CORS and 403 blocks because the request is server-to-server
  const proxyUrl = `${API_BASE}/proxy-pdf?url=${encodeURIComponent(targetUrl)}`;

  let pdf = null;

  try {
    const loadingTask = pdfjsLib.getDocument(proxyUrl);
    pdf = await loadingTask.promise;
  } catch (error) {
    console.error("PDF Download Error:", error);
    throw new Error(`Falha ao baixar o PDF via servidor (${API_BASE}). Verifique se o serviço está rodando.`);
  }
    
  try {
    let fullText = '';
    // Limit to first 15 pages to ensure performance and stay within token limits
    const maxPages = Math.min(pdf.numPages, 15);
    
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += `--- Página ${i} ---\n${pageText}\n`;
    }

    if (pdf.numPages > maxPages) {
      fullText += `\n... (Texto truncado após ${maxPages} páginas de ${pdf.numPages})`;
    }

    return fullText;
  } catch (error) {
    console.error("PDF Parsing Error:", error);
    throw new Error("Erro ao processar o conteúdo do arquivo PDF.");
  }
};