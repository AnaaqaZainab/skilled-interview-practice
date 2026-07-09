import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useServerFn } from "@tanstack/react-start";
import { createInterview } from "@/lib/interview.functions";
import { toast } from "sonner";
import { Loader2, Building2, PlayCircle } from "lucide-react";
import { LANGUAGES } from "./setup";

const PRESETS = [
  { name: "Google", role: "Software Engineer", type: "Technical" as const },
  { name: "Amazon", role: "SDE", type: "Technical" as const },
  { name: "Microsoft", role: "Software Engineer", type: "Technical" as const },
  { name: "Meta", role: "Software Engineer", type: "Technical" as const },
  { name: "Apple", role: "Software Engineer", type: "Technical" as const },
  { name: "Netflix", role: "Senior Engineer", type: "Technical" as const },
  { name: "TCS", role: "Systems Engineer", type: "HR" as const },
  { name: "Infosys", role: "Systems Engineer", type: "HR" as const },
  { name: "Wipro", role: "Project Engineer", type: "HR" as const },
  { name: "Accenture", role: "Associate Software Engineer", type: "HR" as const },
  { name: "Deloitte", role: "Analyst", type: "HR" as const },
  { name: "Goldman Sachs", role: "Analyst", type: "Technical" as const },
];
const TYPES = ["HR", "Technical", "Biotechnology", "TNPSC"] as const;
const DIFFS = ["Easy", "Medium", "Hard"] as const;

export const Route = createFileRoute("/_authenticated/company")({
  component: CompanyPrep,
});

function CompanyPrep() {
  const navigate = useNavigate();
  const create = useServerFn(createInterview);
  const [company, setCompany] = useState("Google");
  const [role, setRole] = useState("Software Engineer");
  const [type, setType] = useState<(typeof TYPES)[number]>("Technical");
  const [difficulty, setDifficulty] = useState<(typeof DIFFS)[number]>("Medium");
  const [language, setLanguage] = useState<string>(
    typeof window !== "undefined" ? localStorage.getItem("prepsage:lang") ?? "English" : "English",
  );
  const [loading, setLoading] = useState(false);

  async function start() {
    if (!company.trim() || !role.trim()) {
      toast.error("Enter a company and role");
      return;
    }
    setLoading(true);
    try {
      localStorage.setItem("prepsage:lang", language);
      const res = await create({
        data: { type, difficulty, language, company: company.trim(), role: role.trim() },
      });
      navigate({ to: "/interview/$id", params: { id: res.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create interview");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-emerald-glow text-primary-foreground">
            <Building2 className="size-5" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Company-Specific Prep</h1>
            <p className="text-muted-foreground">Practice interviews tailored to a specific company & role.</p>
          </div>
        </div>

        <div className="mt-6">
          <Label className="mb-2 block">Popular companies</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  setCompany(p.name);
                  setRole(p.role);
                  setType(p.type);
                }}
                className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                  company === p.name
                    ? "border-primary bg-primary/10 text-primary"
                    : "hover:border-primary/40 hover:bg-primary/5"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border bg-card p-6 shadow-sm">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <Label>Company</Label>
              <Input
                className="mt-1.5"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Stripe"
              />
            </div>
            <div>
              <Label>Target Role</Label>
              <Input
                className="mt-1.5"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Backend Engineer"
              />
            </div>
            <div>
              <Label>Round Type</Label>
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
            </div>
            <div className="md:col-span-2">
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
          </div>
          <Button className="mt-6 w-full" size="lg" onClick={start} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> Generating {company} questions…
              </>
            ) : (
              <>
                <PlayCircle className="mr-2 size-5" /> Start {company} Interview
              </>
            )}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
