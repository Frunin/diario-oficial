import { GazetteDocument } from './types';
import { GoogleGenAI } from "@google/genai";
import { extractTextFromPdf } from './pdfService';
import { summarizeGazette } from './geminiService';

// In-memory cache to store HTML content and avoid repeated network hits
let htmlCache: { url: string; content: string; timestamp: number } | null = null;
const CACHE_DURATION_MS = 1000 * 60 * 10; // 10 minutes

// Use absolute URL for the Production Vercel API
const API_BASE = 'https://diario-oficial-two.vercel.app/api';

// Helper to fetch HTML content via Vercel Proxy
async function fetchHtml(url: string, validateContent?: (html: string) => boolean): Promise<string> {
    
    // 1. Check Local Memory Cache first
    if (htmlCache && htmlCache.url === url && (Date.now() - htmlCache.timestamp < CACHE_DURATION_MS)) {
        if (!validateContent || validateContent(htmlCache.content)) {
            console.log(`[Cache] Usando versão em cache da memória (Válido por ${Math.round((CACHE_DURATION_MS - (Date.now() - htmlCache.timestamp))/60000)}min)`);
            return htmlCache.content;
        } else {
            console.log(`[Cache] Cache invalidado por falha na validação de conteúdo.`);
            htmlCache = null;
        }
    }

    // 2. Fetch from Vercel API Route
    try {
        console.log(`[Fetch] Conectando ao proxy (${API_BASE})...`);
        
        // Pass the target URL as a query parameter
        const proxyUrl = `${API_BASE}/scrape?url=${encodeURIComponent(url)}`;
        
        const localRes = await fetch(proxyUrl, { 
            cache: 'no-store',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!localRes.ok) {
            if (localRes.status === 404) {
                throw new Error(`API Backend não encontrada no endereço ${API_BASE}. Verifique o deploy no Vercel.`);
            }
            const errText = await localRes.text().catch(() => 'Sem detalhes');
            throw new Error(`Proxy respondeu com status: ${localRes.status} (${errText})`);
        }

        const data = await localRes.json();
        
        if (data.success && data.html) {
            console.log("[Fetch] Sucesso: HTML recebido.");
            
            // Validate content
            if (validateContent && !validateContent(data.html)) {
                throw new Error("HTML recebido é inválido ou incompleto.");
            }

            // Update Cache
            htmlCache = {
                url: url,
                content: data.html,
                timestamp: Date.now()
            };

            return data.html;
        } else {
            throw new Error(data.error || "Proxy não retornou HTML.");
        }

    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[Fetch] Erro fatal: ${msg}`);
        throw new Error(
            `Falha na conexão. ${msg}`
        );
    }
}

// Clean HTML text helper
const cleanText = (text: string | null | undefined) => text?.replace(/&nbsp;/g, ' ').trim() || '';

export const checkForNewGazette = async (logger?: (msg: string) => void): Promise<GazetteDocument[]> => {
  const log = logger || console.log;
  
  try {
    const targetUrl = 'https://saojoaodelrei.mg.gov.br/pagina/9837/Diario%20Oficial';
    log(`[System] Iniciando busca...`);

    let pageHtml = await fetchHtml(targetUrl, (html) => html.includes('conteudo_generico_1014'));
    log(`[Scraper] HTML processado com sucesso.`);

    const parser = new DOMParser();
    const doc = parser.parseFromString(pageHtml, 'text/html');
    
    const container = doc.getElementById('conteudo_generico_1014');
    
    if (!container) {
        throw new Error("Container 'conteudo_generico_1014' não encontrado no HTML.");
    }

    const recordRows = container.querySelectorAll('[id="contenedor_registro_generico"]');
    
    log(`[Scraper] Encontrados ${recordRows.length} registros.`);

    const documents: GazetteDocument[] = [];

    for (const row of Array.from(recordRows)) {
        try {
            const linkElement = row.querySelector('[onclick*="obterArquivoCadastroGenerico"]');
            if (!linkElement) continue;

            const onclickText = linkElement.getAttribute('onclick');
            const idMatch = onclickText?.match(/obterArquivoCadastroGenerico\s*\(\s*(\d+)\s*\)/);
            
            if (!idMatch || !idMatch[1]) continue;
            
            const id = idMatch[1];
            // The URL format required for the government site
            const pdfUrl = `https://saojoaodelrei.mg.gov.br/Obter_Arquivo_Cadastro_Generico.php?INT_ARQ=${id}&LG_ADM=undefined`;

            let publicationDate = '';
            let editionLabel = '';
            let siteSummary = '';

            const infoBlocks = row.querySelectorAll('[id="informacao_generica"]');
            infoBlocks.forEach(block => {
                const titleEl = block.querySelector('[id="titulo_generico"]');
                const valueEl = block.querySelector('[id="valor_generico"]');
                
                if (titleEl && valueEl) {
                    const label = cleanText(titleEl.textContent).toLowerCase();
                    const value = cleanText(valueEl.textContent);

                    if (label.includes('data')) publicationDate = value;
                    if (label.includes('edição')) editionLabel = `Edição ${value}`;
                    if (label.includes('resumo')) siteSummary = value;
                }
            });

            if (!publicationDate.includes('2025') && !editionLabel.includes('2025')) {
                continue;
            }

            siteSummary = siteSummary.replace(/<br\s*\/?>/gi, '\n').trim();

            documents.push({
                title: editionLabel || `Diário Oficial (ID: ${id})`,
                url: pdfUrl,
                dateFound: new Date().toISOString(),
                publicationDate: publicationDate || new Date().toLocaleDateString('pt-BR'),
                isNew: false,
                contentSummary: siteSummary,
                editionLabel: editionLabel, 
                rawText: ''
            });

        } catch (err) {
            console.warn(`[Scraper] Erro ao processar linha:`, err);
        }
    }

    documents.sort((a, b) => {
        const idA = parseInt(a.url.match(/INT_ARQ=(\d+)/)?.[1] || '0');
        const idB = parseInt(b.url.match(/INT_ARQ=(\d+)/)?.[1] || '0');
        return idB - idA;
    });

    const recentDocs = documents.slice(0, 5);

    if (recentDocs.length > 0) {
        log(`[Scraper] Analisando o documento mais recente...`);
        const newestDoc = recentDocs[0];
        
        try {
            log(`[PDF] Solicitando download via proxy...`);
            const text = await extractTextFromPdf(newestDoc.url);
            newestDoc.rawText = text.slice(0, 500);
            
            log(`[AI] Gerando análise inteligente...`);
            const aiSummary = await summarizeGazette(text);
            
            newestDoc.contentSummary = `### 🤖 Análise IA\n${aiSummary}\n\n---\n### 📄 Resumo do Site\n${newestDoc.contentSummary}`;
            
        } catch (pdfErr) {
            log(`[PDF] Aviso: Não foi possível analisar o PDF. Exibindo apenas resumo do site.`);
            console.error(pdfErr);
        }
    }

    if (recentDocs.length === 0) {
       log(`[Info] Nenhum documento válido de 2025 encontrado.`);
    }

    return recentDocs;

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    log(`[Scraper] Erro: ${errMsg}`);
    throw error;
  }
};