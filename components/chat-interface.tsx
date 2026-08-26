"use client";

import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Message = { role: "user" | "assistant"; content: string };

export function ChatInterface({
  initialMessages = [],
  initialThreadId,
  placeholder = "Ask anything about your finances…",
}: {
  initialMessages?: Message[];
  initialThreadId?: string;
  placeholder?: string;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [threadId, setThreadId] = useState<string | undefined>(initialThreadId);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    const next: Message[] = [...messages, { role: "user", content: text }, { role: "assistant", content: "" }];
    setMessages(next);
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: next.slice(0, -1),
          threadId,
        }),
      });
      if (!res.body) {
        throw new Error("No response body");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6));
          if (data.type === "delta") {
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = {
                ...copy[copy.length - 1],
                content: copy[copy.length - 1].content + data.text,
              };
              return copy;
            });
          } else if (data.type === "done") {
            if (data.threadId) setThreadId(data.threadId);
          } else if (data.type === "error") {
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = { role: "assistant", content: `⚠ ${data.error}` };
              return copy;
            });
          }
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "The assistant stopped responding";
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: `⚠ ${message}` };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-950">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {messages.length === 0 && (
          <div className="text-sm text-zinc-500 max-w-md">
            <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-2">Try asking:</p>
            <ul className="space-y-1.5 list-disc pl-5">
              <li>Roast my portfolio, then tell me what to fix first</li>
              <li>What&apos;s my LTCG bracket room this year?</li>
              <li>I&apos;m overweight in NVDA — what are my liquidation options?</li>
              <li>Should I prioritize paying off my student loans or invest more?</li>
              <li>Explain the STR + cost segregation strategy with my numbers</li>
            </ul>
          </div>
        )}
        {messages.map((m, i) => (
          <Message key={i} message={m} />
        ))}
      </div>
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-3">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={placeholder}
            rows={2}
            className="resize-none"
            disabled={streaming}
          />
          <Button onClick={send} disabled={!input.trim() || streaming}>
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Message({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
          isUser
            ? "bg-emerald-600 text-white"
            : "bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100",
        )}
      >
        {message.content || (
          <span className="text-zinc-400 dark:text-zinc-500">…</span>
        )}
      </div>
    </div>
  );
}
