import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useServerFn } from "@tanstack/react-start";
import {
  getInterview,
  submitAnswer,
  completeInterview,
  transcribeAudio,
  synthesizeSpeech,
  addFavorite,
  removeFavorite,
  listFavorites,
} from "@/lib/interview.functions";
import { toast } from "sonner";
import { Bot, CheckCircle2, Loader2, Mic, MicOff, Send, Volume2, Square, Star, Timer as TimerIcon } from "lucide-react";

const INTERVIEW_DURATION_SEC = 15 * 60;
const TIMER_STORAGE_PREFIX = "prepsage:deadline:";

function formatTime(sec: number) {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

type QAItem = {
  question: string;
  answer?: string;
  feedback?: string;
  score?: number;
  suggestions?: string;
};

export const Route = createFileRoute("/_authenticated/interview/$id")({
  component: InterviewPage,
});

function InterviewPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fetchInterview = useServerFn(getInterview);
  const submit = useServerFn(submitAnswer);
  const complete = useServerFn(completeInterview);
  const transcribe = useServerFn(transcribeAudio);
  const speak = useServerFn(synthesizeSpeech);
  const fav = useServerFn(addFavorite);
  const unfav = useServerFn(removeFavorite);
  const fetchFavs = useServerFn(listFavorites);

  const [questions, setQuestions] = useState<QAItem[]>([]);
  const [type, setType] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [favSet, setFavSet] = useState<Set<string>>(new Set());
  const [remaining, setRemaining] = useState<number>(INTERVIEW_DURATION_SEC);
  const autoSubmittedRef = useRef(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [row, favs] = await Promise.all([
          fetchInterview({ data: { id } }),
          fetchFavs().catch(() => []),
        ]);
        const qs = (row.questions as QAItem[]) ?? [];
        setQuestions(qs);
        setType(row.type);
        setDifficulty(row.difficulty);
        const firstUnanswered = qs.findIndex((q) => !q.answer);
        setIndex(firstUnanswered === -1 ? qs.length - 1 : firstUnanswered);
        setFavSet(new Set((favs as { question: string }[]).map((f) => f.question)));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load interview");
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      audioRef.current?.pause();
    };
  }, [id, fetchInterview, fetchFavs]);

  const current = questions[index];
  const total = questions.length;
  const answered = questions.filter((q) => q.answer).length;
  const isFav = current ? favSet.has(current.question) : false;

  // Countdown timer — persists deadline across refreshes per interview id.
  useEffect(() => {
    if (loading) return;
    const key = TIMER_STORAGE_PREFIX + id;
    let deadline = Number(localStorage.getItem(key));
    if (!deadline || Number.isNaN(deadline) || deadline < Date.now()) {
      deadline = Date.now() + INTERVIEW_DURATION_SEC * 1000;
      localStorage.setItem(key, String(deadline));
    }
    const tick = () => {
      const secs = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemaining(secs);
      if (secs === 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        toast.warning("Time's up — submitting your interview");
        (async () => {
          try {
            if (answer.trim()) {
              await submit({ data: { id, index, answer: answer.trim() } }).catch(() => {});
            }
            await complete({ data: { id } }).catch(() => {});
          } finally {
            localStorage.removeItem(key);
            navigate({ to: "/result/$id", params: { id } });
          }
        })();
      }
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [loading, id, index, answer, submit, complete, navigate]);


  async function handleSubmit() {
    if (!answer.trim()) return toast.error("Please enter an answer");
    setSubmitting(true);
    try {
      const updated = await submit({ data: { id, index, answer: answer.trim() } });
      const newQs = [...questions];
      newQs[index] = updated as QAItem;
      setQuestions(newQs);
      setAnswer("");
      toast.success(`Scored ${updated.score}/10`);

      if (index + 1 < total) {
        setIndex(index + 1);
      } else {
        const res = await complete({ data: { id } });
        localStorage.removeItem(TIMER_STORAGE_PREFIX + id);
        toast.success(`Interview complete! Overall: ${res.overall_score}/10`);
        navigate({ to: "/result/$id", params: { id } });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleRecord() {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size < 1024) {
          toast.error("Recording too short");
          return;
        }
        setTranscribing(true);
        try {
          const buf = await blob.arrayBuffer();
          const base64 = btoa(
            Array.from(new Uint8Array(buf))
              .map((b) => String.fromCharCode(b))
              .join(""),
          );
          const res = await transcribe({ data: { audioBase64: base64, mimeType } });
          setAnswer((prev) => (prev ? prev + " " : "") + (res.text ?? ""));
          toast.success("Transcribed");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Transcription failed");
        } finally {
          setTranscribing(false);
        }
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast.error("Could not access microphone");
    }
  }

  async function playQuestion() {
    if (speaking) {
      audioRef.current?.pause();
      audioRef.current = null;
      setSpeaking(false);
      return;
    }
    if (!current) return;
    setTtsLoading(true);
    try {
      const res = await speak({ data: { text: current.question, voice: "alloy" } });
      const audio = new Audio(`data:${res.mimeType};base64,${res.audioBase64}`);
      audioRef.current = audio;
      audio.onended = () => setSpeaking(false);
      audio.onerror = () => setSpeaking(false);
      await audio.play();
      setSpeaking(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "TTS failed");
    } finally {
      setTtsLoading(false);
    }
  }

  async function toggleFavorite() {
    if (!current) return;
    const q = current.question;
    const next = new Set(favSet);
    try {
      if (isFav) {
        next.delete(q);
        setFavSet(next);
        await unfav({ data: { question: q } });
        toast.success("Removed from favorites");
      } else {
        next.add(q);
        setFavSet(next);
        await fav({
          data: {
            question: q,
            interview_type: type,
            difficulty,
            interview_id: id,
          },
        });
        toast.success("Added to favorites");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
      // revert
      setFavSet(favSet);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex justify-center py-20">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  if (!current) {
    return (
      <AppShell>
        <p>No questions available.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-primary">
              {type} · {difficulty}
            </div>
            <h1 className="mt-1 text-2xl font-bold">
              Question {index + 1} of {total}
            </h1>
          </div>
          <div className="text-sm text-muted-foreground">{answered} answered</div>
        </div>
        <Progress value={((index + 1) / total) * 100} className="mt-4" />

        <div className="mt-8 rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-glow text-primary-foreground">
              <Bot className="size-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-medium text-muted-foreground">AI Interviewer</div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={playQuestion}
                    disabled={ttsLoading}
                    aria-label={speaking ? "Stop" : "Read question aloud"}
                    title={speaking ? "Stop" : "Read question aloud"}
                  >
                    {ttsLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : speaking ? (
                      <Square className="size-4" />
                    ) : (
                      <Volume2 className="size-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={toggleFavorite}
                    aria-label={isFav ? "Unfavorite" : "Favorite"}
                    title={isFav ? "Remove from favorites" : "Save to favorites"}
                  >
                    <Star className={`size-4 ${isFav ? "fill-primary text-primary" : ""}`} />
                  </Button>
                </div>
              </div>
              <p className="mt-1 text-lg leading-relaxed">{current.question}</p>
            </div>
          </div>

          {current.answer ? (
            <div className="mt-6 rounded-lg border bg-success/10 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <CheckCircle2 className="size-4" /> Answered · Score {current.score}/10
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{current.feedback}</p>
            </div>
          ) : (
            <div className="mt-6">
              <Textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type your answer here…"
                rows={6}
                maxLength={5000}
                disabled={submitting || transcribing}
              />
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  variant={recording ? "destructive" : "outline"}
                  onClick={toggleRecord}
                  disabled={submitting || transcribing}
                >
                  {recording ? (
                    <>
                      <MicOff className="mr-2 size-4" /> Stop recording
                    </>
                  ) : transcribing ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" /> Transcribing…
                    </>
                  ) : (
                    <>
                      <Mic className="mr-2 size-4" /> Speak Answer
                    </>
                  )}
                </Button>
                <div className="ml-auto flex gap-2">
                  <Button onClick={handleSubmit} disabled={submitting || transcribing || !answer.trim()}>
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" /> Scoring…
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 size-4" />
                        {index + 1 === total ? "Submit & Finish" : "Submit"}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {current.answer && (
          <div className="mt-6 flex justify-end gap-2">
            {index > 0 && (
              <Button variant="outline" onClick={() => setIndex(index - 1)}>
                Previous
              </Button>
            )}
            {index + 1 < total ? (
              <Button onClick={() => setIndex(index + 1)}>Next Question</Button>
            ) : (
              <Button
                onClick={async () => {
                  await complete({ data: { id } });
                  navigate({ to: "/result/$id", params: { id } });
                }}
              >
                View Results
              </Button>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
