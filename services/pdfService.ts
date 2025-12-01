// O processamento de PDF foi desativado em favor da busca via Google Search Grounding.
// Sem o proxy, não é possível baixar o binário do PDF devido a restrições de CORS do servidor governamental.

export const extractTextFromPdf = async (url: string): Promise<string> => {
  console.warn("Extração direta de PDF desativada no modo Search Grounding.");
  return "Conteúdo indisponível para extração direta. Por favor, acesse o link original para ler o documento completo.";
};
