import * as pdfjsLib from 'pdfjs-dist';

// Configure worker to use the same version from the CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://aistudiocdn.com/pdfjs-dist@^5.4.449/build/pdf.worker.min.mjs`;

// Use absolute URL for the Production Vercel API
const API_BASE = 'https://diario-oficial-two.vercel.app/api';

export const extractTextFromPdf = async (targetUrl: string): Promise<string> => {
  // Use Vercel Edge Function Proxy
  const proxyUrl = `${API_BASE}/proxy-pdf?url=${encodeURIComponent(targetUrl)}`;

  let pdf = null;

  try {
    const checkRes = await fetch(proxyUrl, { method: 'HEAD' });
    if (checkRes.status === 404) {
         throw new Error("Serviço de proxy PDF não encontrado no backend Vercel.");
    }

    const loadingTask = pdfjsLib.getDocument(proxyUrl);
    pdf = await loadingTask.promise;
  } catch (error) {
    console.error("PDF Download Error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Falha ao baixar o PDF via proxy: ${msg}`);
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