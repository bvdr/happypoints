import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateVoteSummary = async (votes: (string | number)[]): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `
        You are a witty Agile Scrum Master assistant.
        The team has voted on a task complexity. 
        Here are the votes: ${votes.join(', ')}.
        
        Analyze the consensus or disagreement. 
        If everyone agrees, celebrate.
        If there is a wide split (e.g., 1s and 21s), make a funny comment about the confusion.
        If there are "?" or coffee cups, acknowledge them.
        Keep it under 20 words. be fun.
      `,
    });
    return response.text || "Analysis complete.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Could not generate insight.";
  }
};