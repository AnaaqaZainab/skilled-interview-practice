import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useServerFn } from "@tanstack/react-start";
import { mentorChat } from "@/lib/interview.functions";
import { Bot, Loader2, Send, Sparkles, User } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatPage,
});

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "How do I answer 'Tell me about yourself'?",
  "Give me 3 STAR-method examples for teamwork",
  "How to negotiate salary after an offer?",
  "Tips for a TNPSC group I interview?",
];

function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm your PrepSage Mentor 👋 Ask me anything about interviews — questions to expect, how to answer, or how to calm your nerves.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chat = useServerFn(mentorChat);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text.trim() }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await chat({ data: { messages: next.slice(-20) } });
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-3xl flex-col">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-emerald-glow text-primary-foreground">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">AI Mentor Chat</h1>
            <p className="text-xs text-muted-foreground">24/7 interview assistance</p>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="mt-4 flex-1 overflow-y-auto rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur-xl"
        >
          <div className="space-y-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`grid size-8 shrink-0 place-items-center rounded-full ${
                    m.role === "user" ? "bg-muted" : "bg-emerald-glow text-primary-foreground"
                  }`}
                >
                  {m.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}
                </div>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-foreground"
                  }`}
                >
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-glow text-primary-foreground">
                  <Bot className="size-4" />
                </div>
                <div className="rounded-2xl bg-muted/50 px-4 py-3">
                  <Loader2 className="size-4 animate-spin text-primary" />
                </div>
              </div>
            )}
          </div>
        </div>

        {messages.length <= 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-border/60 bg-card/70 px-3 py-1.5 text-xs hover:bg-primary/10 hover:text-primary transition"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mt-3 flex items-end gap-2"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask your mentor anything…"
            rows={1}
            className="min-h-11 resize-none"
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !input.trim()} size="icon">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
