import { Env } from './types';
import { GameSessionDO } from './GameSessionDO';

// Export Durable Object class
export { GameSessionDO };

/**
 * Main Worker - Routes incoming WebSocket requests to the correct Durable Object
 * Each game session gets its own Durable Object instance
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers for frontend
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.CORS_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Upgrade, Connection',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Route: /ws/:sessionId - WebSocket connection endpoint
    const wsMatch = url.pathname.match(/^\/ws\/([A-Z0-9]{6})$/);
    if (wsMatch) {
      const sessionId = wsMatch[1];

      // Get Durable Object instance for this session
      const id = env.GAME_SESSION.idFromName(sessionId);
      const stub = env.GAME_SESSION.get(id);

      // Forward request to Durable Object
      const response = await stub.fetch(request);

      // WebSocket upgrade responses don't need CORS headers
      if (response.status === 101) {
        return response;
      }

      // Add CORS headers to non-WebSocket responses
      const newHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });

      return new Response(response.body, {
        status: response.status,
        headers: newHeaders,
      });
    }

    // Route: /health - Health check endpoint
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({ status: 'ok', timestamp: Date.now() }),
        {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }

    // Route: /api/generate-summary - Generate AI summary for votes
    if (url.pathname === '/api/generate-summary' && request.method === 'POST') {
      try {
        const { votes } = await request.json() as { votes: (string | number)[] };

        if (!env.GEMINI_API_KEY) {
          return new Response(
            JSON.stringify({ summary: 'AI Analysis complete.' }),
            {
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }

        // Call Gemini API
        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `You are a witty Agile Scrum Master assistant.
The team has voted on a task complexity.
Here are the votes: ${votes.join(', ')}.

Analyze the consensus or disagreement.
If everyone agrees, celebrate.
If there is a wide split (e.g., 1s and 21s), make a funny comment about the confusion.
If there are "?" or coffee cups, acknowledge them.
Keep it under 20 words. be fun.`,
                    },
                  ],
                },
              ],
            }),
          }
        );

        const data = await geminiResponse.json() as any;
        const summary =
          data.candidates?.[0]?.content?.parts?.[0]?.text || 'AI Analysis complete.';

        return new Response(JSON.stringify({ summary }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        });
      } catch (error) {
        console.error('Gemini API error:', error);
        return new Response(
          JSON.stringify({ summary: 'Could not generate insight.' }),
          {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          }
        );
      }
    }

    // Route: /api/session/:sessionId - Get session state (HTTP)
    const sessionMatch = url.pathname.match(/^\/api\/session\/([A-Z0-9]{6})$/);
    if (sessionMatch && request.method === 'GET') {
      const sessionId = sessionMatch[1];

      const id = env.GAME_SESSION.idFromName(sessionId);
      const stub = env.GAME_SESSION.get(id);

      const response = await stub.fetch(request);
      const newHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });

      return new Response(response.body, {
        status: response.status,
        headers: newHeaders,
      });
    }

    // 404 for unknown routes
    return new Response('Not Found', {
      status: 404,
      headers: corsHeaders,
    });
  },
};
