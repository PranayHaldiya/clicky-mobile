import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  id: string;
  role: MessageRole;
  text: string;
  timestamp: number;
  audioUrl?: string;
}

export type AssistantStatus =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

interface AssistantContextValue {
  messages: Message[];
  status: AssistantStatus;
  sessionId: string;
  isRecording: boolean;
  startListening: () => void;
  stopListening: () => void;
  sendMessage: (text: string) => Promise<void>;
  clearHistory: () => void;
  currentTranscript: string;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

const SESSION_KEY = "clicky_session_id";
const MESSAGES_KEY = "clicky_messages";
const MAX_MESSAGES = 50;

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

const BASE_URL = `https://${process.env["EXPO_PUBLIC_DOMAIN"] ?? ""}`;

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [currentTranscript, setCurrentTranscript] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const init = async () => {
      let sid = await AsyncStorage.getItem(SESSION_KEY);
      if (!sid) {
        sid = generateId();
        await AsyncStorage.setItem(SESSION_KEY, sid);
      }
      setSessionId(sid);

      const stored = await AsyncStorage.getItem(MESSAGES_KEY);
      if (stored) {
        try {
          setMessages(JSON.parse(stored) as Message[]);
        } catch {}
      }

      setMessages((prev) => {
        if (prev.length === 0) {
          return [
            {
              id: generateId(),
              role: "assistant",
              text: "Hey! I'm Clicky, your personal AI assistant. Ask me anything or tap the mic to speak.",
              timestamp: Date.now(),
            },
          ];
        }
        return prev;
      });
    };
    void init();
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      const toStore = messages.slice(-MAX_MESSAGES);
      void AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(toStore));
    }
  }, [messages]);

  const addMessage = useCallback((role: MessageRole, text: string): string => {
    const id = generateId();
    const msg: Message = { id, role, text, timestamp: Date.now() };
    setMessages((prev) => [...prev, msg]);
    return id;
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || !sessionId) return;

      addMessage("user", text);
      setStatus("thinking");
      setCurrentTranscript("");

      try {
        const response = await fetch(`${BASE_URL}/api/assistant/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, sessionId }),
        });

        if (!response.ok) {
          throw new Error("Chat failed");
        }

        const replyText = decodeURIComponent(
          response.headers.get("X-Reply-Text") ?? "..."
        );

        addMessage("assistant", replyText);
        setStatus("speaking");

        const audioBlob = await response.blob();
        const url = URL.createObjectURL(audioBlob);

        if (typeof window !== "undefined" && window.Audio) {
          const audio = new window.Audio(url);
          audioRef.current = audio;
          audio.onended = () => {
            setStatus("idle");
            URL.revokeObjectURL(url);
          };
          audio.onerror = () => {
            setStatus("idle");
          };
          await audio.play();
        } else {
          setStatus("idle");
        }
      } catch (err) {
        setStatus("error");
        addMessage(
          "assistant",
          "Sorry, I had trouble connecting. Please try again."
        );
        setTimeout(() => setStatus("idle"), 2000);
      }
    },
    [sessionId, addMessage]
  );

  const startListening = useCallback(() => {
    if (status !== "idle") return;
    setIsRecording(true);
    setStatus("listening");
    setCurrentTranscript("");

    if (
      typeof window !== "undefined" &&
      "webkitSpeechRecognition" in window
    ) {
      const SpeechRecognition =
        (window as unknown as { webkitSpeechRecognition: new () => SpeechRecognition })
          .webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i]?.isFinal) {
            final += event.results[i]?.[0]?.transcript ?? "";
          } else {
            interim += event.results[i]?.[0]?.transcript ?? "";
          }
        }
        setCurrentTranscript(final || interim);
        if (final) {
          setIsRecording(false);
          void sendMessage(final);
        }
      };

      recognition.onerror = () => {
        setIsRecording(false);
        setStatus("idle");
      };

      recognition.onend = () => {
        setIsRecording(false);
        if (status === "listening") setStatus("idle");
      };

      recognition.start();
      (window as unknown as Record<string, unknown>)["_clickyRecognition"] = recognition;
    }
  }, [status, sendMessage]);

  const stopListening = useCallback(() => {
    setIsRecording(false);
    if (status === "listening") setStatus("idle");
    const rec = (window as unknown as Record<string, unknown>)["_clickyRecognition"] as {
      stop?: () => void;
    } | undefined;
    if (rec?.stop) rec.stop();
  }, [status]);

  const clearHistory = useCallback(async () => {
    setMessages([
      {
        id: generateId(),
        role: "assistant",
        text: "History cleared. How can I help you?",
        timestamp: Date.now(),
      },
    ]);
    await AsyncStorage.removeItem(MESSAGES_KEY);
  }, []);

  return (
    <AssistantContext.Provider
      value={{
        messages,
        status,
        sessionId,
        isRecording,
        startListening,
        stopListening,
        sendMessage,
        clearHistory,
        currentTranscript,
      }}
    >
      {children}
    </AssistantContext.Provider>
  );
}

export function useAssistant() {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant must be inside AssistantProvider");
  return ctx;
}
