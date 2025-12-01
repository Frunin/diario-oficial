import { GazetteDocument } from '../types';
import { GoogleGenAI } from "@google/genai";

export const checkForNewGazette = async (logger?: (msg: string) => void): Promise<GazetteDocument[]> => {
  const log = logger || console.log;
  
  try {
    log(`[Search] Iniciando busca via Google Search Grounding...`);
    
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Solicitamos ao Gemini que busque atualizações recentes
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Encontre as publicações mais recentes do "Diário Oficial" no site oficial de São João del-Rei (saojoaodelrei.mg.gov.br) de 2025. Liste os decretos ou assuntos principais mencionados nos snippets.',
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "Você é um monitor de transparência pública. Busque por fatos recentes."
      }
    });

    log(`[Search] Busca concluída. Processando resultados...`);

    const documents: GazetteDocument[] = [];
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const summaryText = response.text;

    // Processar os links encontrados pelo Google Search
    groundingChunks.forEach((chunk, index) => {
      if (chunk.web?.uri) {
        const title = chunk.web.title || `Resultado da Busca #${index + 1}`;
        const url = chunk.web.uri;
        
        // Filtro básico para garantir que é relevante
        if (url.includes('saojoaodelrei.mg.gov.br')) {
           // Tenta extrair uma data do título ou define hoje
           const dateMatch = title.match(/(\d{2})\/(\d{2})\/(\d{4})/);
           const dateStr = dateMatch ? dateMatch[0] : new Date().toLocaleDateString('pt-BR');

           // Evitar duplicatas
           if (!documents.some(d => d.url === url)) {
             documents.push({
               title: title,
               url: url,
               dateFound: new Date().toISOString(),
               publicationDate: dateStr,
               isNew: false,
               contentSummary: `Fonte identificada via Google Search. ${summaryText.slice(0, 150)}...` // Usa parte da resposta geral como contexto
             });
           }
        }
      }
    });

    // Se nenhum link direto foi encontrado nos chunks, mas o modelo gerou texto, criamos um item genérico
    if (documents.length === 0 && summaryText) {
       log(`[Search] Nenhum link direto identificado, retornando resumo geral.`);
       documents.push({
         title: "Resumo das últimas atualizações (Google Search)",
         url: "https://saojoaodelrei.mg.gov.br/pagina/9837/Diario%20Oficial",
         dateFound: new Date().toISOString(),
         publicationDate: new Date().toLocaleDateString('pt-BR'),
         isNew: true,
         contentSummary: summaryText
       });
    } else {
       log(`[Search] ${documents.length} fontes encontradas.`);
    }

    return documents;

  } catch (error) {
    log(`[Search] Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    console.error(error);
    return [];
  }
};
