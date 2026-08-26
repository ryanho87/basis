"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Message = { role: "user" | "assistant"; content: string };

type OnboardingResult = {
  primaryPersona: string;
  profileType: string;
  financialCapabilities: string[];
  filingStatus: string;
  state: string | null;
  primaryConcern: string;
  summary: string;
  suggestedStrategies: Array<{ title: string; summary: string; category?: string }>;
};

export function OnboardingChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const streamFromServer = useCallback(async (history: Message[]) => {
    setStreaming(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.body) throw new Error("No response body");
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
          } else if (data.type === "complete") {
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = { role: "assistant", content: data.userVisibleText };
              return copy;
            });
            setResult(data.result);
            router.refresh();
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
      const message = err instanceof Error ? err.message : "The onboarding assistant failed unexpectedly.";
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: `⚠ ${message}` };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }, [router]);

  // Kick off the conversation automatically once.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void streamFromServer([]);
  }, [streamFromServer]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    await streamFromServer(next);
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
      <div className="flex h-[calc(100vh-15rem)] flex-col rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-950">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100",
                )}
              >
                {m.content || <span className="text-zinc-400">…</span>}
              </div>
            </div>
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
              rows={2}
              placeholder={streaming ? "…" : "Type your reply"}
              disabled={streaming}
              className="resize-none"
            />
            <Button onClick={send} disabled={!input.trim() || streaming}>
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </div>
      <aside className="space-y-4">
        {result ? (
          <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/30 p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-4" />
              Profile set
            </div>
            <div className="mt-2 text-sm">
              <div className="font-medium">{result.primaryPersona.replace(/_/g, " ").toLowerCase()}</div>
              <div className="mt-1 text-zinc-600 dark:text-zinc-400">{result.summary}</div>
            </div>
            {result.financialCapabilities?.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {result.financialCapabilities.map((capability) => (
                  <span key={capability} className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                    {capability.replace(/_/g, " ").toLowerCase()}
                  </span>
                ))}
              </div>
            ) : null}
            {result.suggestedStrategies?.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-medium text-zinc-500 mb-2">Suggested strategies</div>
                <ul className="space-y-2">
                  {result.suggestedStrategies.map((s, i) => (
                    <li key={i} className="rounded-md bg-white dark:bg-zinc-900 p-2.5 text-xs">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">{s.title}</div>
                      <div className="mt-0.5 text-zinc-500">{s.summary}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-4">
              <Button
                size="sm"
                onClick={() => router.push("/")}
                className="w-full"
              >
                Go to dashboard
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 text-sm">
            <div className="text-zinc-500">
              The assistant will:
              <ul className="mt-2 space-y-1 list-disc pl-5">
                <li>Learn how your profession shapes your finances</li>
                <li>Detect income, equity, entity, and debt needs</li>
                <li>Tailor the product around those capabilities</li>
                <li>Surface 3-5 relevant strategies</li>
              </ul>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
