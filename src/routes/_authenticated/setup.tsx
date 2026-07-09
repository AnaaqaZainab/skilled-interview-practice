import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { createInterview } from "@/lib/interview.functions";
import { toast } from "sonner";
import { Loader2, PlayCircle } from "lucide-react";

const TYPES = ["HR", "Technical", "Biotechnology", "TNPSC"] as const;
const DIFFS = ["Easy", "Medium", "Hard"] as const;
export const LANGUAGES = [
  "English",
  "Hindi",
  "Tamil",
  "Telugu",
  "Bengali",
  "Marathi",
  "Kannada",
  "Malayalam",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Arabic",
  "Mandarin Chinese",
  "Japanese",
] as const;

export const Route = createFileRoute("/_authenticated/setup")({
  component: Setup,
});

function Setup() {
  const navigate = useNavigate();
  const [type, setType] = useState<(typeof TYPES)[number]>("HR");
  const [difficulty, setDifficulty] = useState<(typeof DIFFS)[number]>("Medium");
  const [language, setLanguage] = useState<string>(
    typeof window !== "undefined" ? localStorage.getItem("prepsage:lang") ?? "English" : "English",
  );
  const [loading, setLoading] = useState(false);
  const create = useServerFn(createInterview);

  async function start() {
    setLoading(true);
    try {
      localStorage.setItem("prepsage:lang", language);
      const res = await create({ data: { type, difficulty, language } });
      navigate({ to: "/interview/$id", params: { id: res.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create interview");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-xl">
        <h1 className="text-3xl font-bold">Set up your interview</h1>
        <p className="mt-1 text-muted-foreground">Pick the type, difficulty, and language.</p>

        <div className="mt-8 rounded-2xl border bg-card p-6 shadow-sm">
          <div className="space-y-5">
            <div>
              <Label>Interview Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Questions and feedback will be delivered in this language.
              </p>
            </div>
            <div>
              <Label>Difficulty</Label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {DIFFS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                      difficulty === d
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "hover:border-primary/40 hover:bg-primary/5"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <Button className="w-full" size="lg" onClick={start} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Generating questions…
                </>
              ) : (
                <>
                  <PlayCircle className="mr-2 size-5" /> Start Interview
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
