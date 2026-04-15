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
const VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

interface MemoryRecord {
  id: string;
  vector: number[];
  attributes: {
    text: string;
    role: string;
    sessionId: string;
    timestamp: string;
  };
}

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
      const charCode = word.charCodeAt(i);
      const idx = (charCode * (i + 1) * 31) % dims;
      vec[idx] = (vec[idx] ?? 0) + 1;
    }
    vec[wordHash % dims] = (vec[wordHash % dims] ?? 0) + 2;
  }

  const magnitude = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (magnitude === 0) return vec;
  return vec.map((v) => v / magnitude);
}

async function storeMemory(
  sessionId: string,
  role: string,
  text: string
): Promise<void> {
  try {
    const ns = tpuf.namespace(NAMESPACE);
    const embedding = simpleEmbedding(text);
    const id = `${sessionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await ns.upsert({
      vectors: [
        {
          id,
          vector: embedding,
          attributes: { text, role, sessionId, timestamp: new Date().toISOString() },
        } as MemoryRecord,
      ],
      distance_metric: "cosine_distance",
    });
    logger.info({ sessionId, role, chars: text.length }, "Memory stored");
  } catch (err) {
    logger.warn({ err }, "Failed to store memory");
  }
}

async function retrieveMemories(
  query: string,
  sessionId: string,
  limit = 5
): Promise<string[]> {
  try {
    const ns = tpuf.namespace(NAMESPACE);
    const embedding = simpleEmbedding(query);

    const results = await ns.query({
      vector: embedding,
      top_k: limit,
      distance_metric: "cosine_distance",
      filters: { sessionId: ["Eq", sessionId] },
      include_attributes: ["text", "role", "timestamp"],
    });

    return (results ?? [])
      .filter((r) => ((r as { dist?: number }).dist ?? 1) < 0.8)
      .map((r) => {
        const attrs = r.attributes as { text?: string; role?: string } | undefined;
        return `[${attrs?.role ?? "unknown"}]: ${attrs?.text ?? ""}`;
      });
  } catch (err) {
    logger.warn({ err }, "Failed to retrieve memories");
    return [];
  }
}

async function generateReply(
  message: string,
  memoryContext: string
): Promise<string> {
  const systemPrompt = `You are Clicky, a smart personal AI assistant on mobile. Be concise — max 2 sentences for voice. ${
    memoryContext ? "Past context:\n" + memoryContext : ""
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
        const data = await res.json() as {
          choices: Array<{ message: { content: string } }>;
        };
        const reply = data.choices[0]?.message?.content?.trim();
        if (reply) return reply;
      }
    } catch (err) {
      logger.warn({ err }, "Groq API call failed, using fallback");
    }
  }

  return generateFallbackReply(message);
}

function generateFallbackReply(message: string): string {
  const msg = message.toLowerCase().trim();

  if (/^(hello|hi|hey|sup|yo)/.test(msg)) {
    return "Hey! I'm Clicky, your AI assistant. What can I help you with?";
  }
  if (/how are you|how.s it going|what.s up/.test(msg)) {
    return "All good and ready to help! What's on your mind?";
  }
  if (/your name|who are you/.test(msg)) {
    return "I'm Clicky — your personal AI assistant built for ElevenHacks. Nice to meet you!";
  }
  if (/what time|what.s the time/.test(msg)) {
    return `It's ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`;
  }
  if (/what.s the date|what day/.test(msg)) {
    return `Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}.`;
  }
  if (/weather/.test(msg)) {
    return "I can't check real-time weather right now, but you can ask your device's weather app!";
  }
  if (/thank/.test(msg)) {
    return "You're welcome! Anything else I can help with?";
  }
  if (/help|what can you do/.test(msg)) {
    return "I can answer questions, remember our conversations, and help you think things through. Just ask!";
  }
  if (/remember|memory|last time/.test(msg)) {
    return "I store our conversations using Turbopuffer vector memory so I can recall them later. Ask me about something specific!";
  }
  if (/elevenlabs|voice|speech/.test(msg)) {
    return "My voice is powered by ElevenLabs — one of the best text-to-speech AI systems out there!";
  }

  const responses = [
    `Great question! "${message.slice(0, 40)}..." I'm still expanding my knowledge, but I'm here to help.`,
    "That's interesting! Tell me more and I'll do my best to assist you.",
    "I heard you! I'm always getting smarter. For now, I'm ready to help with anything I can.",
    "Good thinking! I'll remember that for our future conversations.",
  ];
  return responses[Math.floor(Math.random() * responses.length)] ?? responses[0]!;
}

router.get("/agent-config", (_req: Request, res: Response) => {
  const agentId = process.env["ELEVENLABS_AGENT_ID"] ?? "";
  res.json({ agentId, hasAgentId: !!agentId });
});

router.post("/signed-url", async (req: Request, res: Response) => {
  try {
    const agentId = process.env["ELEVENLABS_AGENT_ID"] ?? "";
    const targetId = (req.body as { agentId?: string }).agentId ?? agentId;

    if (!targetId) {
      res.status(400).json({ error: "No ElevenLabs agent ID configured." });
      return;
    }

    const result = await elevenlabs.conversationalAi.getSignedUrl({
      agent_id: targetId,
    });
    res.json({ signedUrl: result.signed_url });
  } catch (err) {
    logger.error({ err }, "Failed to get signed URL");
    res.status(500).json({ error: "Failed to get signed URL" });
  }
});

router.post("/chat", async (req: Request, res: Response) => {
  try {
    const { message, sessionId } = req.body as {
      message?: string;
      sessionId?: string;
    };

    if (!message || !sessionId) {
      res.status(400).json({ error: "message and sessionId are required" });
      return;
    }

    const [memories] = await Promise.all([
      retrieveMemories(message, sessionId),
      storeMemory(sessionId, "user", message),
    ]);

    const memoryContext = memories.length > 0
      ? memories.join("\n")
      : "";

    const reply = await generateReply(message, memoryContext);

    await storeMemory(sessionId, "assistant", reply);

    const ttsStream = await elevenlabs.textToSpeech.stream(VOICE_ID, {
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

router.post("/memories", async (req: Request, res: Response) => {
  try {
    const { query, sessionId } = req.body as {
      query?: string;
      sessionId?: string;
    };

    if (!query || !sessionId) {
      res.status(400).json({ error: "query and sessionId required" });
      return;
    }

    const memories = await retrieveMemories(query, sessionId);
    res.json({ memories });
  } catch (err) {
    logger.error({ err }, "Memories error");
    res.status(500).json({ error: "Memory retrieval failed" });
  }
});

router.post("/tts", async (req: Request, res: Response) => {
  try {
    const { text, voiceId } = req.body as { text?: string; voiceId?: string };
    if (!text) {
      res.status(400).json({ error: "text is required" });
      return;
    }

    const stream = await elevenlabs.textToSpeech.stream(voiceId ?? VOICE_ID, {
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
