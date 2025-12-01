import { GazetteDocument } from './types';
import { GoogleGenAI } from "@google/genai";
import { extractTextFromPdf } from './pdfService';
import { summarizeGazette } from './geminiService';

// In-memory cache
let dataCache: { url: string; data: any; timestamp: number } | null = null;
const CACHE_DURATION_MS = 1000 * 60 * 10; // 10 minutes

// Use absolute URL for the Production Vercel API
const API_BASE = 'https://diario-oficial-two.vercel.app/api';

// Helper to fetch Data from Vercel Proxy (Returns JSON documents OR HTML fallback)
async function fetchScraperData(url: string): Promise<{ mode: 'json' | 'html', data: any }> {
    
    // 1. Check Cache
    if (dataCache && dataCache.url === url && (Date.now() - dataCache.timestamp < CACHE_DURATION_MS)) {
        console.log(`[Cache] Usando versão em cache da memória.`);
        return dataCache.data;
    }

    // 2. Fetch from Vercel API Route
    try {
        console.log(`[Fetch] Conectando ao scraper (${API_BASE})...`);
        const proxyUrl = `${API_BASE}/scrape?url=${encodeURIComponent(url)}`;
        
        const localRes = await fetch(proxyUrl, { 
            cache: 'no-store',
            headers: { 'Accept': 'application/json' }
        });

        if (!localRes.ok) {
            const errText = await localRes.text().catch(() => '');
            if (localRes.status === 404) throw new Error(`API Backend não encontrada.`);
            if (errText.includes("403") || errText.includes("Forbidden")) throw new Error("403_FORBIDDEN");
            throw new Error(`Proxy status: ${localRes.status}`);
        }

        const responseData = await localRes.json();
        
        if (!responseData.success) {
            if (responseData.error && responseData.error.includes("403")) throw new Error("403_FORBIDDEN");
            throw new Error(responseData.error || "Erro no proxy.");
        }

        const result = {
            mode: responseData.mode as 'json' | 'html',
            data: responseData.mode === 'json' ? responseData.data : responseData.html
        };

        // Update Cache
        dataCache = {
            url: url,
            data: result,
            timestamp: Date.now()
        };

        return result;

    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "403_FORBIDDEN") {
           throw new Error("O site oficial recusou a conexão (Erro 403). Tentando estratégia alternativa...");
        }
        console.error(`[Fetch] Erro fatal: ${msg}`);
        throw e;
    }
}

// Fallback: Gemini Search
async function findLatestGazetteViaGemini(log: (msg: string) => void): Promise<GazetteDocument[]> {
    try {
        log("[Fallback] Site bloqueado. Usando Google Search (Gemini)...");
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        // Updated prompt to not strictly require 2025
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: 'Encontre o link do PDF e a data do "Diário Oficial de São João del-Rei" mais recente publicado. O site oficial é saojoaodelrei.mg.gov.br.',
            config: { tools: [{ googleSearch: {} }] }
        });

        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (!chunks || chunks.length === 0) throw new Error("Sem resultados na busca.");

        const documents: GazetteDocument[] = [];
        const mainChunk = chunks.find(c => c.web?.uri && c.web.uri.includes('saojoaodelrei.mg.gov.br'));
        
        if (mainChunk && mainChunk.web) {
            documents.push({
                title: mainChunk.web.title || "Diário Oficial (Busca Web)",
                url: mainChunk.web.uri,
                dateFound: new Date().toISOString(),
                publicationDate: new Date().toLocaleDateString('pt-BR'),
                isNew: false,
                contentSummary: `### 🔍 Resultado de Busca\n\nEste documento foi localizado via Google Search.\n\n${response.text}`,
                editionLabel: "Busca Web",
                rawText: ""
            });
            log("[Fallback] Documento encontrado via Google Search.");
        }
        return documents;
    } catch (error) {
        console.error("Search Fallback Error:", error);
        return [];
    }
}

// Helper for HTML parsing (Legacy Fallback)
const parseHtmlLocally = (html: string, log: (msg: string) => void): GazetteDocument[] => {
    log(`[Parser] Processando HTML localmente (Fallback)...`);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const container = doc.getElementById('conteudo_generico_1014');
    
    if (!container) throw new Error("Container HTML não encontrado.");

    const rows = container.querySelectorAll('[id="contenedor_registro_generico"]');
    const documents: GazetteDocument[] = [];

    rows.forEach(row => {
        try {
            const linkElement = row.querySelector('[onclick*="obterArquivoCadastroGenerico"]');
            if (!linkElement) return;

            const onclickText = linkElement.getAttribute('onclick');
            const idMatch = onclickText?.match(/obterArquivoCadastroGenerico\s*\(\s*(\d+)\s*\)/);
            if (!idMatch || !idMatch[1]) return;
            
            const id = idMatch[1];
            const pdfUrl = `https://saojoaodelrei.mg.gov.br/Obter_Arquivo_Cadastro_Generico.php?INT_ARQ=${id}&LG_ADM=undefined`;

            let publicationDate = '';
            let editionLabel = '';
            let siteSummary = '';

            row.querySelectorAll('[id="informacao_generica"]').forEach(block => {
                const titleEl = block.querySelector('[id="titulo_generico"]');
                const valueEl = block.querySelector('[id="valor_generico"]');
                if (titleEl && valueEl) {
                    const label = (titleEl.textContent || '').trim().toLowerCase();
                    const value = (valueEl.textContent || '').replace(/&nbsp;/g, ' ').trim();
                    if (label.includes('data')) publicationDate = value;
                    if (label.includes('edição')) editionLabel = `Edição ${value}`;
                    if (label.includes('resumo')) siteSummary = value;
                }
            });

            documents.push({
                title: editionLabel || `Diário Oficial (ID: ${id})`,
                url: pdfUrl,
                dateFound: new Date().toISOString(),
                publicationDate: publicationDate || new Date().toLocaleDateString('pt-BR'),
                isNew: false,
                contentSummary: siteSummary.replace(/<br\s*\/?>/gi, '\n').trim(),
                editionLabel: editionLabel, 
                rawText: ''
            });
        } catch (e) { console.warn("Erro linha HTML:", e); }
    });
    return documents;
};

export const checkForNewGazette = async (logger?: (msg: string) => void): Promise<GazetteDocument[]> => {
  const log = logger || console.log;
  
  try {
    const targetUrl = 'https://saojoaodelrei.mg.gov.br/pagina/9837/Diario%20Oficial';
    log(`[System] Iniciando scraper...`);

    let documents: GazetteDocument[] = [];

    try {
        // Fetch data from backend (either JSON docs or HTML string)
        const response = await fetchScraperData(targetUrl);

        if (response.mode === 'json') {
            log(`[Backend] Dados processados recebidos via Puppeteer.`);
            // Map the JSON data to GazetteDocument
            documents = response.data.map((item: any) => ({
                title: item.title,
                url: item.url, // Fully built URL from backend
                dateFound: new Date().toISOString(),
                publicationDate: item.publicationDate || new Date().toLocaleDateString('pt-BR'),
                isNew: false,
                contentSummary: item.contentSummary,
                editionLabel: item.editionLabel,
                rawText: ''
            }));
        } else {
            // HTML Fallback Mode
            documents = parseHtmlLocally(response.data, log);
        }

    } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.message.includes("403")) {
            return await findLatestGazetteViaGemini(log);
        }
        throw fetchError;
    }

    // Removed specific year filter to allow all recent documents
    const currentDocs = documents;

    // Sort by ID (descending)
    currentDocs.sort((a, b) => {
        const idA = parseInt(a.url.match(/INT_ARQ=(\d+)/)?.[1] || '0');
        const idB = parseInt(b.url.match(/INT_ARQ=(\d+)/)?.[1] || '0');
        return idB - idA;
    });

    log(`[Scraper] ${currentDocs.length} documentos encontrados.`);

    const recentDocs = currentDocs.slice(0, 5);

    // Process the newest document
    if (recentDocs.length > 0) {
        log(`[Scraper] Analisando o documento mais recente...`);
        const newestDoc = recentDocs[0];
        
        try {
            log(`[PDF] Baixando PDF (${newestDoc.url})...`);
            // The URL is already fully built by the backend/scraper
            const text = await extractTextFromPdf(newestDoc.url);
            newestDoc.rawText = text.slice(0, 500);
            
            log(`[AI] Gerando resumo...`);
            const aiSummary = await summarizeGazette(text);
            
            newestDoc.contentSummary = `### 🤖 Análise IA\n${aiSummary}\n\n---\n### 📄 Resumo do Site\n${newestDoc.contentSummary}`;
            
        } catch (pdfErr) {
            log(`[PDF] Aviso: Falha ao ler PDF. Exibindo resumo do site.`);
            console.error(pdfErr);
        }
    } else {
        log(`[Info] Nenhum documento recente encontrado.`);
    }

    return recentDocs;

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    log(`[Scraper] Erro: ${errMsg}`);
    throw error;
  }
};