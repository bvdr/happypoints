/**
 * Generate AI-powered vote summary by calling the Worker backend
 * This keeps the API key secure on the server side
 */
export const generateVoteSummary = async (votes: (string | number)[]): Promise<string> => {
  try {
    // Determine Worker URL based on environment
    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const workerUrl = isDevelopment
      ? 'http://localhost:8787'
      : `https://${import.meta.env.VITE_WORKER_URL || 'planning-poker-worker.bogdanvdragomir4273.workers.dev'}`;

    const response = await fetch(`${workerUrl}/api/generate-summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ votes }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.summary || "AI Analysis complete.";
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return "Could not generate insight.";
  }
};