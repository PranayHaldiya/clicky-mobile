import { Router } from "express";
import { ElevenLabsClient } from "elevenlabs";
import { Turbopuffer } from "@turbopuffer/turbopuffer";
import type { Request, Response } from "express";
import { logger } from "../lib/logger";

const router = Router();

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env["ELEVENLABS_API_KEY"],
});

const tpuf = new Turbopuffer({
  apiKey: process.env["TURBOPUFFER_API_KEY"] ?? "",
  region: process.env["TURBOPUFFER_REGION"] ?? "gcp-us-central1",
});

const NAMESPACE = "clicky-memories";
const VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"; // George - ElevenLabs premade voice

// Simple bag-of-words embedding (128-dim, normalized) — no external API needed
function simpleEmbedding(text: string): number[] {
  const dims = 128;
  const vec: number[] = new Array(dims).fill(0);
  const words = text.toLowerCase().split(/\s+/);

  for (const word of words) {
    const wordHash =
      word.split("").reduce((a, c) => {
        const h = (a << 5) - a + c.charCodeAt(0);
        return h & h;
      }, 0) & 0x7fffffff;
    for (let i = 0; i < word.length; i++) {
      const idx = (word.charCodeAt(i) * (i + 1) * 31) % dims;
      vec[idx] = (vec[idx] ?? 0) + 1;
    }
    vec[wordHash % dims] = (vec[wordHash % dims] ?? 0) + 2;
  }

  const magnitude = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (magnitude === 0) return vec;
  return vec.map((v) => v / magnitude);
}

// Store a conversation turn in Turbopuffer
async function storeMemory(
  sessionId: string,
  role: string,
  text: string
): Promise<void> {
  try {
    const ns = tpuf.namespace(NAMESPACE);
    const vector = simpleEmbedding(text);
    const id = `${sessionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Turbopuffer v2 API: write() with upsert_rows
    // Row format: { id, vector, ...attributes as flat keys }
    await ns.write({
      upsert_rows: [{ id, vector, text, role, sessionId, timestamp: new Date().toISOString() }],
      distance_metric: "cosine_distance",
    });

    logger.info({ sessionId, role, chars: text.length }, "Memory stored in turbopuffer");
  } catch (err) {
    logger.warn({ err }, "Failed to store memory");
  }
}

// Retrieve relevant memories from Turbopuffer using ANN search
async function retrieveMemories(
  query: string,
  sessionId: string,
  topK = 5
): Promise<string[]> {
  try {
    const ns = tpuf.namespace(NAMESPACE);
    const embedding = simpleEmbedding(query);

    // Turbopuffer v2 API: query() with rank_by for ANN vector search
    const results = await ns.query({
      rank_by: ["vector", "ANN", embedding],
      top_k: topK,
      distance_metric: "cosine_distance",
      filters: ["sessionId", "Eq", sessionId],
      include_attributes: ["text", "role", "timestamp"],
    });

    const rows = (results as { rows?: Array<{ $dist?: number; text?: string; role?: string }> }).rows ?? [];
    return rows
      .filter((r) => (r.$dist ?? 1) < 0.85)
      .map((r) => `[${r.role ?? "unknown"}]: ${r.text ?? ""}`);
  } catch (err) {
    const errMsg = String(err);
    // Namespace not found on first use — that's fine, it gets created on first write
    if (errMsg.includes("not found") || errMsg.includes("404")) {
      return [];
    }
    logger.warn({ err }, "Failed to retrieve memories");
    return [];
  }
}

// Generate a reply using Groq (if key available) or smart fallback
async function generateReply(message: string, memoryContext: string): Promise<string> {
  const systemPrompt = `You are Clicky, a smart personal AI assistant on mobile. Be concise — max 2 short sentences for voice. Friendly and direct.${
    memoryContext ? "\n\nRelevant past context:\n" + memoryContext : ""
  }`;

  const groqKey = process.env["GROQ_API_KEY"] ?? "";
  if (groqKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
          max_tokens: 150,
          temperature: 0.7,
        }),
      });
      if (res.ok) {
        const data = await res.json() as { choices: Array<{ message: { content: string } }> };
        const reply = data.choices[0]?.message?.content?.trim();
        if (reply) return reply;
      }
    } catch (err) {
      logger.warn({ err }, "Groq API failed, using fallback");
    }
  }

  return generateFallbackReply(message);
}

function generateFallbackReply(message: string): string {
  const msg = message.toLowerCase().trim();

  if (/^(hello|hi|hey|sup|yo)\b/.test(msg))
    return "Hey! I'm Clicky, your AI assistant. What can I help you with?";
  if (/how are you|how.s it going|what.s up/.test(msg))
    return "All good and ready to help! What's on your mind?";
  if (/your name|who are you/.test(msg))
    return "I'm Clicky — your personal AI assistant powered by ElevenLabs and Turbopuffer. Nice to meet you!";
  if (/what time/.test(msg))
    return `It's ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`;
  if (/what.s the date|what day/.test(msg))
    return `Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}.`;
  if (/weather/.test(msg))
    return "I can't check real-time weather yet, but your phone's weather app has you covered!";
  if (/thank/.test(msg))
    return "You're welcome! Anything else I can help with?";
  if (/help|what can you do/.test(msg))
    return "I can answer questions, remember our conversations using Turbopuffer, and speak to you via ElevenLabs. Just ask!";
  if (/memory|remember|last time/.test(msg))
    return "I store our conversations as vectors in Turbopuffer so I can recall them later. Try asking me something we've talked about!";

  const fallbacks = [
    "That's a great question! I'm still learning, but I'm here to help however I can.",
    "Interesting! Tell me more and I'll do my best to assist you.",
    "Got it. I'm always getting smarter — what else can I do for you?",
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)] ?? fallbacks[0]!;
}

// GET /api/assistant/agent-config
router.get("/agent-config", (_req: Request, res: Response) => {
  const agentId = process.env["ELEVENLABS_AGENT_ID"] ?? "";
  res.json({ agentId, hasAgentId: !!agentId });
});

// POST /api/assistant/signed-url — get ElevenLabs Conversational AI signed URL
router.post("/signed-url", async (req: Request, res: Response) => {
  try {
    const agentId = process.env["ELEVENLABS_AGENT_ID"] ?? "";
    const targetId = (req.body as { agentId?: string }).agentId ?? agentId;
    if (!targetId) {
      res.status(400).json({ error: "No ElevenLabs agent ID configured (set ELEVENLABS_AGENT_ID)." });
      return;
    }
    const result = await elevenlabs.conversationalAi.getSignedUrl({ agent_id: targetId });
    res.json({ signedUrl: result.signed_url });
  } catch (err) {
    logger.error({ err }, "Failed to get signed URL");
    res.status(500).json({ error: "Failed to get signed URL" });
  }
});

// POST /api/assistant/chat — main chat endpoint: returns TTS audio stream + text reply header
router.post("/chat", async (req: Request, res: Response) => {
  try {
    const { message, sessionId } = req.body as { message?: string; sessionId?: string };

    if (!message || !sessionId) {
      res.status(400).json({ error: "message and sessionId are required" });
      return;
    }

    // Retrieve relevant past memories + store user message concurrently
    const [memories] = await Promise.all([
      retrieveMemories(message, sessionId),
      storeMemory(sessionId, "user", message),
    ]);

    const memoryContext = memories.join("\n");
    const reply = await generateReply(message, memoryContext);

    // Store assistant reply in memory (don't await — fire and forget)
    void storeMemory(sessionId, "assistant", reply);

    // Stream ElevenLabs TTS audio back — use convertAsStream (correct v1.59 method)
    const ttsStream = await elevenlabs.textToSpeech.convertAsStream(VOICE_ID, {
      text: reply,
      model_id: "eleven_turbo_v2_5",
      output_format: "mp3_44100_128",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    });

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("X-Reply-Text", encodeURIComponent(reply));

    for await (const chunk of ttsStream) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    logger.error({ err }, "Chat error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to process message" });
    }
  }
});

// POST /api/assistant/memories — query Turbopuffer memories
router.post("/memories", async (req: Request, res: Response) => {
  try {
    const { query, sessionId } = req.body as { query?: string; sessionId?: string };
    if (!query || !sessionId) {
      res.status(400).json({ error: "query and sessionId are required" });
      return;
    }
    const memories = await retrieveMemories(query, sessionId);
    res.json({ memories });
  } catch (err) {
    logger.error({ err }, "Memories error");
    res.status(500).json({ error: "Memory retrieval failed" });
  }
});

// POST /api/assistant/tts — standalone TTS endpoint
router.post("/tts", async (req: Request, res: Response) => {
  try {
    const { text, voiceId } = req.body as { text?: string; voiceId?: string };
    if (!text) {
      res.status(400).json({ error: "text is required" });
      return;
    }

    const stream = await elevenlabs.textToSpeech.convertAsStream(voiceId ?? VOICE_ID, {
      text,
      model_id: "eleven_turbo_v2_5",
      output_format: "mp3_44100_128",
    });

    res.setHeader("Content-Type", "audio/mpeg");
    for await (const chunk of stream) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    logger.error({ err }, "TTS error");
    if (!res.headersSent) {
      res.status(500).json({ error: "TTS failed" });
    }
  }
});

export default router;
