import { GoogleGenAI } from "@google/genai";

export const summarizeGazette = async (text: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = `
      You are an assistant analyzing the "Diário Oficial" (Official Gazette) of São João del-Rei, MG.
      
      Below is the text extracted from the latest PDF document. 
      Please provide a concise, structured summary in Portuguese (pt-BR).
      
      Focus on:
      1. **Key Decrees (Decretos):** Any new regulations.
      2. **Hirings/Exonerations (Nomeações/Exonerações):** Key personnel changes.
      3. **Bidding Processes (Licitações):** Major contracts or calls.
      4. **General Announcements:** Anything affecting the public directly.
      
      If the text contains mostly tabular data or nonsense due to extraction errors, try to summarize what kind of list it appears to be.

      Here is the document text:
      ${text}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: "You are a helpful government transparency assistant. Be objective and concise.",
        temperature: 0.3, // Low temperature for factual accuracy
      }
    });

    return response.text || "Não foi possível gerar um resumo.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Erro ao conectar com a IA para gerar o resumo. Tente novamente mais tarde.";
  }
};