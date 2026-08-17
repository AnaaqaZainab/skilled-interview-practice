import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useServerFn } from "@tanstack/react-start";
import {
  labChat, generatePuzzle, evaluatePuzzle, personalityAssessment, labInsight,
} from "@/lib/lab.functions";
import { synthesizeSpeech } from "@/lib/interview.functions";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import {
  Rocket, ShieldAlert, Puzzle, Users, Phone, Flame, Brain, TrendingUp,
  Film, Box, Loader2, Send, Sparkles, Volume2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/lab")({
  component: LabPage,
  head: () => ({
    meta: [
      { title: "Innovation Lab — Rare AI Interview Rounds | PrepSage" },
      {
        name: "description",
        content:
          "Lie detection, brain teasers, group discussion, stress mode, personality tests, success prediction, highlight reels and a virtual 3D interview room.",
      },
      { property: "og:title", content: "Innovation Lab — Rare AI Interview Rounds" },
      {
        property: "og:description",
        content: "Nine experimental AI interview rounds you won't find anywhere else.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Msg = { role: "user" | "assistant"; content: string };

const CARD = "rounded-2xl border border-border/60 bg-card/70 p-5 shadow-sm backdrop-blur-xl";

/* ------------------------------------------------------------------ */
/* Insight panels: lie detection, prediction, highlight reel           */
/* ------------------------------------------------------------------ */
function InsightPanel({
  kind, title, blurb, icon: Icon, scoreLabel,
}: {
  kind: "consistency" | "prediction" | "highlights";
  title: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
  scoreLabel: string;
}) {
  const run = useServerFn(labInsight);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ score: number | null; markdown: string } | null>(null);

  const go = async () => {
    setLoading(true);
    try {
      setResult(await run({ data: { kind } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-emerald-glow text-primary-foreground">
            <Icon className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{blurb}</p>
          </div>
        </div>
        <Button onClick={go} disabled={loading}>
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
          Analyze my interviews
        </Button>
      </div>

      {result && (
        <div className="mt-5">
          {typeof result.score === "number" && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{scoreLabel}</span>
                <span className="font-semibold text-primary">{result.score}%</span>
              </div>
              <Progress value={result.score} className="mt-2" />
            </div>
          )}
          <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-primary">
            <ReactMarkdown>{result.markdown}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Conversational rounds: discussion, phone, stress                    */
/* ------------------------------------------------------------------ */
function ChatRound({
  mode, title, blurb, icon: Icon, topicLabel, topicPlaceholder, opener, speak,
}: {
  mode: "discussion" | "phone" | "stress";
  title: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
  topicLabel: string;
  topicPlaceholder: string;
  opener: string;
  speak?: boolean;
}) {
  const chat = useServerFn(labChat);
  const tts = useServerFn(synthesizeSpeech);
  const [topic, setTopic] = useState("");
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const say = async (text: string) => {
    try {
      const { audioBase64, mimeType } = await tts({ data: { text: text.slice(0, 900), voice: "alloy" } });
      const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
      await audio.play();
    } catch {
      /* audio is best-effort */
    }
  };

  const send = async (content: string, history: Msg[]) => {
    setBusy(true);
    try {
      const next = [...history, { role: "user" as const, content }];
      setMessages(next);
      const { reply } = await chat({ data: { mode, topic: topic || undefined, messages: next } });
      setMessages([...next, { role: "assistant", content: reply }]);
      if (speak) void say(reply);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  if (!started) {
    return (
      <div className={CARD}>
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-emerald-glow text-primary-foreground">
            <Icon className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{blurb}</p>
          </div>
        </div>
        <div className="mt-5 space-y-2">
          <label className="text-sm font-medium">{topicLabel}</label>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={topicPlaceholder} />
        </div>
        <Button
          className="mt-4"
          onClick={() => {
            setStarted(true);
            void send(opener, []);
          }}
        >
          Start round
        </Button>
      </div>
    );
  }

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold">
          <Icon className="size-4 text-primary" /> {title}
          {topic && <span className="text-xs font-normal text-muted-foreground">· {topic}</span>}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setStarted(false);
            setMessages([]);
          }}
        >
          Restart
        </Button>
      </div>

      <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
        {messages
          .filter((m, i) => !(i === 0 && m.role === "user"))
          .map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-muted/60 backdrop-blur"
              }`}
            >
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
              {m.role === "assistant" && speak && (
                <button
                  className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                  onClick={() => void say(m.content)}
                >
                  <Volume2 className="size-3" /> Replay
                </button>
              )}
            </div>
          ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim() || busy) return;
          const v = input.trim();
          setInput("");
          void send(v, messages);
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your response…"
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !input.trim()} size="icon">
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Puzzle round                                                        */
/* ------------------------------------------------------------------ */
function PuzzleRound() {
  const gen = useServerFn(generatePuzzle);
  const evaluate = useServerFn(evaluatePuzzle);
  const [category, setCategory] = useState("Logic");
  const [difficulty, setDifficulty] = useState("Medium");
  const [puzzle, setPuzzle] = useState<{ puzzle: string; hint: string } | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<{
    score: number; verdict: string; feedback: string; solution: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const newPuzzle = async () => {
    setBusy(true);
    setResult(null);
    setAnswer("");
    setShowHint(false);
    try {
      setPuzzle(await gen({ data: { category: category as never, difficulty: difficulty as never } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!puzzle || !answer.trim()) return;
    setBusy(true);
    try {
      setResult(await evaluate({ data: { puzzle: puzzle.puzzle, answer: answer.trim() } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={CARD}>
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-lg bg-emerald-glow text-primary-foreground">
          <Puzzle className="size-5" />
        </div>
        <div>
          <h2 className="font-semibold">AI Puzzle & Brain Teaser Round</h2>
          <p className="text-sm text-muted-foreground">Graded on reasoning, not just the answer.</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["Logic", "Math", "Lateral thinking", "Estimation", "Coding logic"].map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={difficulty} onValueChange={setDifficulty}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["Easy", "Medium", "Hard"].map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={newPuzzle} disabled={busy}>
          {busy && !puzzle ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          New puzzle
        </Button>
      </div>

      {puzzle && (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">{puzzle.puzzle}</div>
          {showHint ? (
            <p className="text-sm text-muted-foreground">💡 {puzzle.hint}</p>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setShowHint(true)}>Show hint</Button>
          )}
          <Textarea
            rows={5}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Walk through your reasoning step by step…"
          />
          <Button onClick={submit} disabled={busy || !answer.trim()}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} Submit answer
          </Button>

          {result && (
            <div className="rounded-xl border border-border/60 bg-muted/40 p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{result.verdict}</span>
                <span className="text-primary font-bold">{result.score}/10</span>
              </div>
              <p className="mt-2 text-sm">{result.feedback}</p>
              <p className="mt-3 text-sm text-muted-foreground"><strong>Ideal solution:</strong> {result.solution}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Personality assessment                                              */
/* ------------------------------------------------------------------ */
const QUESTIONS: { text: string; trait: keyof Scores; reverse?: boolean }[] = [
  { text: "I enjoy exploring new ideas and unfamiliar problems.", trait: "openness" },
  { text: "I prefer routine over variety.", trait: "openness", reverse: true },
  { text: "I plan tasks carefully and meet deadlines.", trait: "conscientiousness" },
  { text: "I often leave things until the last minute.", trait: "conscientiousness", reverse: true },
  { text: "I feel energized speaking in front of a group.", trait: "extraversion" },
  { text: "I prefer working quietly on my own.", trait: "extraversion", reverse: true },
  { text: "I go out of my way to help teammates succeed.", trait: "agreeableness" },
  { text: "I push my own view even when it creates friction.", trait: "agreeableness", reverse: true },
  { text: "High-pressure situations make me anxious.", trait: "neuroticism" },
  { text: "I stay calm when plans fall apart.", trait: "neuroticism", reverse: true },
];

type Scores = {
  openness: number; conscientiousness: number; extraversion: number;
  agreeableness: number; neuroticism: number;
};

function PersonalityRound() {
  const run = useServerFn(personalityAssessment);
  const [answers, setAnswers] = useState<number[]>(QUESTIONS.map(() => 3));
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ disc: string; discLabel: string; markdown: string } | null>(null);

  const compute = (): Scores => {
    const base: Scores = {
      openness: 0, conscientiousness: 0, extraversion: 0, agreeableness: 0, neuroticism: 0,
    };
    const counts: Record<string, number> = {};
    QUESTIONS.forEach((q, i) => {
      const v = q.reverse ? 6 - answers[i] : answers[i];
      base[q.trait] += v;
      counts[q.trait] = (counts[q.trait] ?? 0) + 1;
    });
    (Object.keys(base) as (keyof Scores)[]).forEach((k) => {
      base[k] = Math.round(((base[k] / (counts[k] * 5)) * 100));
    });
    return base;
  };

  const submit = async () => {
    setBusy(true);
    try {
      setReport(await run({ data: { scores: compute() } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const scores = compute();

  return (
    <div className={CARD}>
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-lg bg-emerald-glow text-primary-foreground">
          <Brain className="size-5" />
        </div>
        <div>
          <h2 className="font-semibold">Personality Assessment (Big Five / DISC)</h2>
          <p className="text-sm text-muted-foreground">10 statements · 1 = strongly disagree, 5 = strongly agree</p>
        </div>
      </div>

      <div className="mt-5 space-y-5">
        {QUESTIONS.map((q, i) => (
          <div key={i}>
            <div className="flex items-center justify-between text-sm">
              <span>{q.text}</span>
              <span className="ml-3 font-semibold text-primary">{answers[i]}</span>
            </div>
            <Slider
              className="mt-2"
              min={1}
              max={5}
              step={1}
              value={[answers[i]]}
              onValueChange={(v) =>
                setAnswers((a) => a.map((x, j) => (j === i ? v[0] : x)))
              }
            />
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-5">
        {(Object.keys(scores) as (keyof Scores)[]).map((k) => (
          <div key={k} className="rounded-xl border border-border/60 bg-muted/40 p-3 text-center">
            <div className="text-lg font-bold text-primary">{scores[k]}</div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.slice(0, 12)}</div>
          </div>
        ))}
      </div>

      <Button className="mt-5" onClick={submit} disabled={busy}>
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
        Get my profile
      </Button>

      {report && (
        <div className="mt-5">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
            DISC: {report.disc} · {report.discLabel}
          </div>
          <div className="prose prose-sm dark:prose-invert mt-3 max-w-none prose-headings:text-primary">
            <ReactMarkdown>{report.markdown}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Virtual 3D interview room                                           */
/* ------------------------------------------------------------------ */
function Room3D() {
  const [rot, setRot] = useState(0);
  const [cam, setCam] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const toggleCam = async () => {
    if (cam) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCam(false);
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = s;
      setCam(true);
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = s;
      });
    } catch {
      toast.error("Camera blocked. Allow camera access in your browser address bar.");
    }
  };

  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-emerald-glow text-primary-foreground">
            <Box className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold">Virtual 3D Interview Room</h2>
            <p className="text-sm text-muted-foreground">Rehearse inside a simulated boardroom.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={toggleCam}>
          {cam ? "Stop camera" : "Sit at the table"}
        </Button>
      </div>

      <div
        className="mt-5 overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-b from-muted/60 to-background"
        style={{ perspective: "900px" }}
      >
        <div
          className="relative mx-auto h-[340px] w-full transition-transform duration-500"
          style={{ transformStyle: "preserve-3d", transform: `rotateY(${rot}deg) rotateX(6deg)` }}
        >
          {/* back wall */}
          <div
            className="absolute left-1/2 top-8 h-48 w-[70%] -translate-x-1/2 rounded-lg border border-primary/25 bg-primary/5"
            style={{ transform: "translateZ(-140px)" }}
          >
            <div className="absolute inset-6 rounded-md border border-primary/30 bg-background/40 grid place-items-center text-xs text-muted-foreground">
              PrepSage Interview Room
            </div>
          </div>
          {/* floor */}
          <div
            className="absolute bottom-0 left-1/2 h-52 w-[90%] -translate-x-1/2 rounded-lg bg-[linear-gradient(to_top,hsl(var(--muted)),transparent)]"
            style={{ transform: "rotateX(72deg) translateZ(-40px)" }}
          />
          {/* table */}
          <div
            className="absolute bottom-16 left-1/2 h-24 w-[62%] -translate-x-1/2 rounded-[40%] border border-border/70 bg-card/80 shadow-xl"
            style={{ transform: "rotateX(64deg)" }}
          />
          {/* interviewers */}
          {[-1, 0, 1].map((i) => (
            <div
              key={i}
              className="absolute top-24 grid size-16 place-items-center rounded-full border border-primary/30 bg-card/90 text-xs shadow-lg"
              style={{ left: `calc(50% + ${i * 130}px - 32px)`, transform: `translateZ(${i === 0 ? -60 : -20}px)` }}
            >
              {["HR", "Tech", "Mgr"][i + 1]}
            </div>
          ))}
          {/* candidate seat / webcam */}
          <div className="absolute bottom-2 left-1/2 size-28 -translate-x-1/2 overflow-hidden rounded-full border-2 border-primary/50 bg-muted grid place-items-center">
            {cam ? (
              <video ref={videoRef} autoPlay playsInline muted className="size-full scale-x-[-1] object-cover" />
            ) : (
              <span className="text-xs text-muted-foreground">You</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-sm text-muted-foreground">Look around the room</div>
        <Slider className="mt-2" min={-35} max={35} step={1} value={[rot]} onValueChange={(v) => setRot(v[0])} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Tip: practise addressing each panellist — glance at HR when answering culture questions, Tech for
        problem-solving, and the Manager when talking about impact.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function LabPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-emerald-glow text-primary-foreground">
            <Rocket className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Innovation Lab</h1>
            <p className="text-sm text-muted-foreground">
              Nine rare interview rounds — from lie detection to a virtual 3D boardroom.
            </p>
          </div>
        </div>

        <Tabs defaultValue="lie" className="mt-6">
          <TabsList className="flex h-auto flex-wrap justify-start gap-1">
            <TabsTrigger value="lie"><ShieldAlert className="mr-1.5 size-4" />Lie Detection</TabsTrigger>
            <TabsTrigger value="puzzle"><Puzzle className="mr-1.5 size-4" />Puzzles</TabsTrigger>
            <TabsTrigger value="gd"><Users className="mr-1.5 size-4" />Group Discussion</TabsTrigger>
            <TabsTrigger value="phone"><Phone className="mr-1.5 size-4" />Phone HR</TabsTrigger>
            <TabsTrigger value="stress"><Flame className="mr-1.5 size-4" />Stress Mode</TabsTrigger>
            <TabsTrigger value="personality"><Brain className="mr-1.5 size-4" />Personality</TabsTrigger>
            <TabsTrigger value="predict"><TrendingUp className="mr-1.5 size-4" />Prediction</TabsTrigger>
            <TabsTrigger value="reel"><Film className="mr-1.5 size-4" />Highlight Reel</TabsTrigger>
            <TabsTrigger value="room"><Box className="mr-1.5 size-4" />3D Room</TabsTrigger>
          </TabsList>

          <TabsContent value="lie" className="mt-5">
            <InsightPanel
              kind="consistency"
              title="AI Lie Detection"
              blurb="Cross-checks every answer you've given for contradictions and evasiveness."
              icon={ShieldAlert}
              scoreLabel="Consistency score"
            />
          </TabsContent>

          <TabsContent value="puzzle" className="mt-5"><PuzzleRound /></TabsContent>

          <TabsContent value="gd" className="mt-5">
            <ChatRound
              mode="discussion"
              title="AI Group Discussion Moderator"
              blurb="You, two AI participants and a moderator debating a real GD topic."
              icon={Users}
              topicLabel="Discussion topic"
              topicPlaceholder="e.g. Is remote work killing company culture?"
              opener="Let's begin the group discussion. Introduce the topic and start."
            />
          </TabsContent>

          <TabsContent value="phone" className="mt-5">
            <ChatRound
              mode="phone"
              title="Mock HR Phone Interview"
              blurb="Audio-first screening call — the recruiter speaks, you reply."
              icon={Phone}
              topicLabel="Role you're screening for"
              topicPlaceholder="e.g. Junior Data Analyst at TCS"
              opener="(call connected)"
              speak
            />
          </TabsContent>

          <TabsContent value="stress" className="mt-5">
            <ChatRound
              mode="stress"
              title="Stress Interview Mode"
              blurb="A deliberately tough interviewer who challenges every answer."
              icon={Flame}
              topicLabel="Role / domain"
              topicPlaceholder="e.g. Backend Engineer"
              opener="Start the stress interview with your first hard question."
            />
          </TabsContent>

          <TabsContent value="personality" className="mt-5"><PersonalityRound /></TabsContent>

          <TabsContent value="predict" className="mt-5">
            <InsightPanel
              kind="prediction"
              title="Interview Success Prediction"
              blurb="Predicts your odds of clearing a real interview from your practice history."
              icon={TrendingUp}
              scoreLabel="Predicted success probability"
            />
          </TabsContent>

          <TabsContent value="reel" className="mt-5">
            <InsightPanel
              kind="highlights"
              title="AI Highlight Reel"
              blurb="Your strongest answers, edited into a showreel you can reuse."
              icon={Film}
              scoreLabel="Showreel strength"
            />
          </TabsContent>

          <TabsContent value="room" className="mt-5"><Room3D /></TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
