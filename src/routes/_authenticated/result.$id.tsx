import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import {
  getInterview,
  listFavorites,
  addFavorite,
  removeFavorite,
} from "@/lib/interview.functions";
import { toast } from "sonner";
import { Award, Download, Loader2, PlayCircle, Star } from "lucide-react";
import jsPDF from "jspdf";

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
  const fetchFavs = useServerFn(listFavorites);
  const fav = useServerFn(addFavorite);
  const unfav = useServerFn(removeFavorite);
  const [row, setRow] = useState<{
    type: string;
    difficulty: string;
    overall_score: number | null;
    questions: QAItem[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [favSet, setFavSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const [r, favs] = await Promise.all([
          fetchInterview({ data: { id } }),
          fetchFavs().catch(() => []),
        ]);
        setRow({
          type: r.type,
          difficulty: r.difficulty,
          overall_score: r.overall_score,
          questions: (r.questions as QAItem[]) ?? [],
        });
        setFavSet(new Set((favs as { question: string }[]).map((f) => f.question)));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, fetchInterview, fetchFavs]);

  async function toggleFav(question: string) {
    const next = new Set(favSet);
    const wasFav = next.has(question);
    try {
      if (wasFav) {
        next.delete(question);
        setFavSet(next);
        await unfav({ data: { question } });
      } else {
        next.add(question);
        setFavSet(next);
        await fav({
          data: {
            question,
            interview_type: row?.type,
            difficulty: row?.difficulty,
            interview_id: id,
          },
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
      setFavSet(favSet);
    }
  }

  function downloadPdf() {
    if (!row) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 48;
    const maxWidth = pageWidth - margin * 2;
    let y = margin;

    const addLine = (text: string, opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) => {
      const { size = 11, bold = false, color = [30, 30, 30] } = opts;
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(text, maxWidth) as string[];
      for (const l of lines) {
        if (y > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(l, margin, y);
        y += size * 1.35;
      }
    };
    const gap = (n = 8) => (y += n);

    addLine("PrepSage Interview Report", { size: 20, bold: true, color: [16, 100, 60] });
    gap(4);
    addLine(`Type: ${row.type}    Difficulty: ${row.difficulty}`, { size: 11, color: [80, 80, 80] });
    addLine(`Overall Score: ${Number(row.overall_score ?? 0).toFixed(1)} / 10`, { size: 13, bold: true });
    addLine(`Generated: ${new Date().toLocaleString()}`, { size: 10, color: [120, 120, 120] });
    gap(10);
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    gap(14);

    row.questions.forEach((q, i) => {
      addLine(`Question ${i + 1}`, { size: 12, bold: true, color: [16, 100, 60] });
      addLine(q.question, { size: 12 });
      gap(4);
      addLine("Your Answer:", { size: 10, bold: true, color: [80, 80, 80] });
      addLine(q.answer ?? "—", { size: 11 });
      gap(2);
      addLine(`Score: ${q.score ?? "-"} / 10`, { size: 11, bold: true });
      addLine("AI Feedback:", { size: 10, bold: true, color: [80, 80, 80] });
      addLine(q.feedback ?? "—", { size: 11 });
      addLine("Suggestions:", { size: 10, bold: true, color: [80, 80, 80] });
      addLine(q.suggestions ?? "—", { size: 11 });
      gap(14);
    });

    doc.save(`prepsage-report-${id.slice(0, 8)}.pdf`);
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
            <Button onClick={downloadPdf}>
              <Download className="mr-2 size-4" /> Download PDF
            </Button>
            <Button asChild variant="outline">
              <Link to="/setup">
                <PlayCircle className="mr-2 size-4" /> New Interview
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          {row.questions.map((q, i) => {
            const isFav = favSet.has(q.question);
            return (
              <div key={i} className="rounded-2xl border bg-card p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="text-xs font-medium text-muted-foreground">Question {i + 1}</div>
                    <h3 className="mt-1 text-lg font-semibold">{q.question}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => toggleFav(q.question)}
                      aria-label={isFav ? "Unfavorite" : "Favorite"}
                    >
                      <Star className={`size-4 ${isFav ? "fill-primary text-primary" : ""}`} />
                    </Button>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                      {q.score ?? "-"}/10
                    </span>
                  </div>
                </div>
                <Section label="Your answer" text={q.answer ?? "—"} />
                <Section label="AI feedback" text={q.feedback ?? "—"} />
                <Section label="Suggestions" text={q.suggestions ?? "—"} />
              </div>
            );
          })}
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
