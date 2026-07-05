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
} from "@/lib/interview.functions";
import { toast } from "sonner";
import { Bot, CheckCircle2, Loader2, Mic, MicOff, Send } from "lucide-react";

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

  const [questions, setQuestions] = useState<QAItem[]>([]);
  const [type, setType] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const row = await fetchInterview({ data: { id } });
        const qs = (row.questions as QAItem[]) ?? [];
        setQuestions(qs);
        setType(row.type);
        setDifficulty(row.difficulty);
        const firstUnanswered = qs.findIndex((q) => !q.answer);
        setIndex(firstUnanswered === -1 ? qs.length - 1 : firstUnanswered);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load interview");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, fetchInterview]);

  const current = questions[index];
  const total = questions.length;
  const answered = questions.filter((q) => q.answer).length;

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
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
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
            <div>
              <div className="text-xs font-medium text-muted-foreground">AI Interviewer</div>
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
