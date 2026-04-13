import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

// Simple in-memory store for user preferences (Adaptive Learning Module simulation)
const userPreferences: Record<string, any> = {
  frequentApps: {},
  topics: []
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes FIRST
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, context, voiceName = 'Kore' } = req.body;
      
      // Update preferences based on message (very basic simulation)
      if (message.toLowerCase().includes('open') || message.toLowerCase().includes('kholo')) {
         const words = message.split(' ');
         const openIndex = words.findIndex((w: string) => w.toLowerCase() === 'open' || w.toLowerCase() === 'kholo');
         if (openIndex !== -1 && words.length > openIndex + 1) {
             const appName = words[openIndex + 1];
             userPreferences.frequentApps[appName] = (userPreferences.frequentApps[appName] || 0) + 1;
         }
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `User said: "${message}". Context: ${JSON.stringify(context || {})}. User Preferences: ${JSON.stringify(userPreferences)}`,
        config: {
          systemInstruction: `You are an advanced AI assistant named Max, similar to J.A.R.V.I.S. from Iron Man. 
You control the user's device via voice commands.
Analyze the user's request and return a structured JSON response.
If the user wants to open an app, set action to "open_app" and provide the app name.
If the user wants to search, set action to "search" and provide the query.
If the user wants to type, set action to "type" and provide the text.
Always provide a conversational response in the "response_text" field that you will speak back to the user.
CRITICAL: You MUST respond in Hindi language (written in Devanagari script). Keep it concise, futuristic, helpful, and natural sounding.
Use the provided User Preferences to personalize your response if applicable.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              action: {
                type: Type.STRING,
                description: "The action to perform (e.g., 'open_app', 'search', 'type', 'none', 'greet')",
              },
              app: {
                type: Type.STRING,
                description: "The name of the app to open, if applicable.",
              },
              query: {
                type: Type.STRING,
                description: "The search query, if applicable.",
              },
              text_to_type: {
                type: Type.STRING,
                description: "The text to type, if applicable.",
              },
              response_text: {
                type: Type.STRING,
                description: "The spoken response from the AI in Hindi.",
              }
            },
            required: ["action", "response_text"]
          },
          tools: [
            { googleSearch: {} }
          ],
          toolConfig: { includeServerSideToolInvocations: true }
        }
      });

      const jsonStr = response.text?.trim();
      if (!jsonStr) {
        throw new Error("Empty response from Gemini");
      }
      
      const parsed = JSON.parse(jsonStr);

      // Generate High-Quality TTS Audio
      try {
        const ttsResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: parsed.response_text }] }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: voiceName },
                },
            },
          },
        });
        const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          parsed.audioBase64 = base64Audio;
        }
      } catch (ttsError) {
        console.error("TTS Generation Error:", ttsError);
      }

      res.json(parsed);
    } catch (error) {
      console.error("Error in /api/chat:", error);
      res.status(500).json({ error: "Failed to process command" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const path = await import("path");
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
