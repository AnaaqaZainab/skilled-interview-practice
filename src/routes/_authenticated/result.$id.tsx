import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { getInterview } from "@/lib/interview.functions";
import { toast } from "sonner";
import { Award, Download, Loader2, PlayCircle } from "lucide-react";

type QAItem = {
  question: string;
  answer?: string;
  feedback?: string;
  score?: number;
  suggestions?: string;
};

export const Route = createFileRoute("/_authenticated/result/$id")({
  component: ResultPage,
});

function ResultPage() {
  const { id } = Route.useParams();
  const fetchInterview = useServerFn(getInterview);
  const [row, setRow] = useState<{
    type: string;
    difficulty: string;
    overall_score: number | null;
    questions: QAItem[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetchInterview({ data: { id } });
        setRow({
          type: r.type,
          difficulty: r.difficulty,
          overall_score: r.overall_score,
          questions: (r.questions as QAItem[]) ?? [],
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, fetchInterview]);

  function download() {
    if (!row) return;
    const lines: string[] = [];
    lines.push(`PrepSage Interview Report`);
    lines.push(`Type: ${row.type} | Difficulty: ${row.difficulty}`);
    lines.push(`Overall Score: ${Number(row.overall_score ?? 0).toFixed(1)}/10`);
    lines.push("");
    row.questions.forEach((q, i) => {
      lines.push(`Q${i + 1}: ${q.question}`);
      lines.push(`Your answer: ${q.answer ?? "(no answer)"}`);
      lines.push(`Score: ${q.score ?? "-"}/10`);
      lines.push(`Feedback: ${q.feedback ?? "-"}`);
      lines.push(`Suggestions: ${q.suggestions ?? "-"}`);
      lines.push("");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prepsage-report-${id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
  if (!row) return null;

  const overall = Number(row.overall_score ?? 0);
  const overallLabel =
    overall >= 8 ? "Excellent" : overall >= 6 ? "Good" : overall >= 4 ? "Fair" : "Keep practicing";

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-glow text-primary-foreground">
            <Award className="size-7" />
          </div>
          <div className="mt-4 text-xs font-medium uppercase tracking-wider text-primary">
            {row.type} · {row.difficulty}
          </div>
          <div className="mt-2 text-5xl font-bold">
            {overall.toFixed(1)}
            <span className="text-2xl text-muted-foreground">/10</span>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">Overall Score · {overallLabel}</div>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={download}>
              <Download className="mr-2 size-4" /> Download Report
            </Button>
            <Button asChild variant="outline">
              <Link to="/setup">
                <PlayCircle className="mr-2 size-4" /> New Interview
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          {row.questions.map((q, i) => (
            <div key={i} className="rounded-2xl border bg-card p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-medium text-muted-foreground">Question {i + 1}</div>
                  <h3 className="mt-1 text-lg font-semibold">{q.question}</h3>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                  {q.score ?? "-"}/10
                </span>
              </div>
              <Section label="Your answer" text={q.answer ?? "—"} />
              <Section label="AI feedback" text={q.feedback ?? "—"} />
              <Section label="Suggestions" text={q.suggestions ?? "—"} />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function Section({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-4">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm">{text}</p>
    </div>
  );
}
