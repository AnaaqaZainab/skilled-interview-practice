import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  FileText,
  Sparkles,
  Trash2,
  PlayCircle,
  Wand2,
  Download,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  analyzeResume,
  listResumes,
  deleteResume,
  generateResumeInterview,
  buildResume,
} from "@/lib/resume.functions";

export const Route = createFileRoute("/_authenticated/resume")({
  component: ResumePage,
});

function toBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result as string;
      res(s.split(",")[1] ?? "");
    };
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function ResumePage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listResumes);
  const { data: resumes = [], isLoading } = useQuery({
    queryKey: ["resumes"],
    queryFn: () => fetchList(),
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Resume Intelligence</h1>
          <p className="mt-1 text-muted-foreground">
            Upload your resume for AI analysis, ATS scoring, and personalized interview questions.
          </p>
        </div>

        <Tabs defaultValue="analyze">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="analyze">Analyze</TabsTrigger>
            <TabsTrigger value="library">My Resumes</TabsTrigger>
            <TabsTrigger value="builder">AI Builder</TabsTrigger>
          </TabsList>

          <TabsContent value="analyze" className="mt-6">
            <UploadCard onDone={() => qc.invalidateQueries({ queryKey: ["resumes"] })} />
          </TabsContent>

          <TabsContent value="library" className="mt-6 space-y-4">
            {isLoading ? (
              <div className="rounded-2xl border bg-card/70 p-8 text-center text-muted-foreground backdrop-blur-xl">
                Loading…
              </div>
            ) : resumes.length === 0 ? (
              <div className="rounded-2xl border bg-card/70 p-8 text-center text-muted-foreground backdrop-blur-xl">
                No resumes yet. Upload one on the Analyze tab.
              </div>
            ) : (
              resumes.map((r) => <ResumeCard key={r.id} resume={r} />)
            )}
          </TabsContent>

          <TabsContent value="builder" className="mt-6">
            <BuilderCard />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function UploadCard({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [targetRole, setTargetRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    id: string;
    analysis: Awaited<ReturnType<typeof analyzeResume>>["analysis"];
  } | null>(null);
  const analyze = useServerFn(analyzeResume);

  async function submit() {
    if (!file) return toast.error("Pick a PDF or DOCX file first.");
    if (file.size > 8 * 1024 * 1024) return toast.error("Max file size is 8MB.");
    setLoading(true);
    setResult(null);
    try {
      const b64 = await toBase64(file);
      const res = await analyze({
        data: {
          filename: file.name,
          mimeType: file.type || "application/pdf",
          fileBase64: b64,
          targetRole: targetRole || undefined,
        },
      });
      setResult(res);
      onDone();
      toast.success("Resume analyzed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card/70 p-6 shadow-sm backdrop-blur-xl">
        <div className="space-y-4">
          <div>
            <Label>Resume file (PDF, DOCX, or TXT)</Label>
            <div className="mt-1.5 flex items-center gap-3">
              <label
                htmlFor="resume-file"
                className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-4 py-4 text-sm hover:bg-primary/10"
              >
                <Upload className="size-4 text-primary" />
                <span className="truncate">{file ? file.name : "Choose file…"}</span>
              </label>
              <input
                id="resume-file"
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <div>
            <Label>Target role (optional)</Label>
            <Input
              className="mt-1.5"
              placeholder="e.g. Senior Frontend Engineer"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
            />
          </div>
          <Button onClick={submit} disabled={loading || !file} size="lg" className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> Analyzing…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 size-4" /> Analyze Resume
              </>
            )}
          </Button>
        </div>
      </div>

      {result && <AnalysisView id={result.id} analysis={result.analysis} />}
    </div>
  );
}

type Analysis = Awaited<ReturnType<typeof analyzeResume>>["analysis"];

function AnalysisView({ id, analysis }: { id: string; analysis: Analysis }) {
  const score = Math.max(0, Math.min(100, analysis.ats_score ?? 0));
  const tone =
    score >= 80 ? "text-emerald-500" : score >= 60 ? "text-amber-500" : "text-destructive";
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card/70 p-6 shadow-sm backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm uppercase tracking-wide text-muted-foreground">ATS score</div>
            <div className={`text-5xl font-bold ${tone}`}>{score}<span className="text-2xl text-muted-foreground">/100</span></div>
          </div>
          <div className="flex-1 min-w-[200px] max-w-md">
            <Progress value={score} />
            <p className="mt-3 text-sm text-muted-foreground">{analysis.summary}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Strengths" items={analysis.strengths} tone="emerald" />
        <Section title="Weaknesses" items={analysis.weaknesses} tone="amber" />
        <Section title="Missing keywords" items={analysis.missing_keywords} tone="neutral" pill />
        <Section title="Skill gaps" items={analysis.skill_gaps} tone="neutral" pill />
      </div>

      <Section title="Improvement suggestions" items={analysis.improvement_suggestions} tone="neutral" />

      <QuestionsLauncher resumeId={id} />
    </div>
  );
}

function Section({
  title,
  items,
  tone,
  pill,
}: {
  title: string;
  items?: string[];
  tone: "emerald" | "amber" | "neutral";
  pill?: boolean;
}) {
  if (!items || items.length === 0) return null;
  const dot =
    tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-primary";
  return (
    <div className="rounded-2xl border bg-card/70 p-5 shadow-sm backdrop-blur-xl">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {pill ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((i, idx) => (
            <Badge key={idx} variant="secondary">{i}</Badge>
          ))}
        </div>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {items.map((i, idx) => (
            <li key={idx} className="flex gap-2">
              <span className={`mt-2 size-1.5 shrink-0 rounded-full ${dot}`} />
              <span>{i}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuestionsLauncher({ resumeId }: { resumeId: string }) {
  const nav = useNavigate();
  const [focus, setFocus] = useState<"resume" | "projects" | "experience">("resume");
  const [difficulty, setDifficulty] = useState<"Easy" | "Medium" | "Hard">("Medium");
  const [type, setType] = useState<"HR" | "Technical" | "Biotechnology" | "TNPSC">("Technical");
  const [loading, setLoading] = useState(false);
  const gen = useServerFn(generateResumeInterview);

  async function start() {
    setLoading(true);
    try {
      const res = await gen({ data: { resumeId, focus, difficulty, type } });
      nav({ to: "/interview/$id", params: { id: res.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-card/70 p-5 shadow-sm backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <PlayCircle className="size-5 text-primary" />
        <h3 className="font-semibold">Start a personalized interview</h3>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Questions generated from your resume content.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <Label className="text-xs">Focus</Label>
          <Select value={focus} onValueChange={(v) => setFocus(v as typeof focus)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="resume">Whole resume</SelectItem>
              <SelectItem value="projects">Projects</SelectItem>
              <SelectItem value="experience">Experience</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["HR", "Technical", "Biotechnology", "TNPSC"] as const).map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Difficulty</Label>
          <Select value={difficulty} onValueChange={(v) => setDifficulty(v as typeof difficulty)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["Easy", "Medium", "Hard"] as const).map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button className="mt-4 w-full" onClick={start} disabled={loading}>
        {loading ? <><Loader2 className="mr-2 size-4 animate-spin" /> Generating…</> : <><Sparkles className="mr-2 size-4" /> Generate & Start</>}
      </Button>
    </div>
  );
}

function ResumeCard({
  resume,
}: {
  resume: { id: string; filename: string; analysis: Analysis | null; created_at: string };
}) {
  const qc = useQueryClient();
  const del = useServerFn(deleteResume);
  const [open, setOpen] = useState(false);
  const score = resume.analysis?.ats_score ?? 0;

  return (
    <div className="rounded-2xl border bg-card/70 p-5 shadow-sm backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <FileText className="size-5" />
          </div>
          <div>
            <div className="font-semibold">{resume.filename}</div>
            <div className="text-xs text-muted-foreground">
              {new Date(resume.created_at).toLocaleString()} · ATS {score}/100
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : "View"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={async () => {
              await del({ data: { id: resume.id } });
              qc.invalidateQueries({ queryKey: ["resumes"] });
            }}
            aria-label="Delete"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      {open && resume.analysis && (
        <div className="mt-4">
          <AnalysisView id={resume.id} analysis={resume.analysis} />
        </div>
      )}
    </div>
  );
}

type BuiltResume = Awaited<ReturnType<typeof buildResume>>["resume"];
type Template = "modern" | "classic" | "minimal";

function BuilderCard() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    location: "",
    links: "",
    targetRole: "",
    summary: "",
    skills: "",
    experience: "",
    projects: "",
    education: "",
    certifications: "",
    tone: "Impactful" as "Impactful" | "Formal" | "Concise" | "Creative",
  });
  const [loading, setLoading] = useState(false);
  const [resume, setResume] = useState<BuiltResume | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [template, setTemplate] = useState<Template>("modern");
  const build = useServerFn(buildResume);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    if (!form.name || !form.targetRole) return toast.error("Name and target role required.");
    setLoading(true);
    try {
      const res = await build({ data: form });
      setResume(res.resume);
      setMarkdown(res.markdown);
      toast.success("Resume built. Preview on the right.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  function downloadMd() {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form.name.replace(/\s+/g, "_") || "resume"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printPdf() {
    window.print();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-2 rounded-2xl border bg-card/70 p-6 shadow-sm backdrop-blur-xl print:hidden">
        <h3 className="font-semibold">Your info</h3>
        <p className="text-sm text-muted-foreground">
          Fill what you have — AI sharpens wording, quantifies impact, and formats it into a real resume.
        </p>
        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Full name *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div>
              <Label>Target role *</Label>
              <Input value={form.targetRole} onChange={(e) => set("targetRole", e.target.value)} placeholder="e.g. Backend Engineer" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Location</Label>
              <Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Chennai, IN" />
            </div>
            <div>
              <Label>Links</Label>
              <Input value={form.links} onChange={(e) => set("links", e.target.value)} placeholder="github.com/you, linkedin.com/in/you" />
            </div>
          </div>
          <div>
            <Label>Summary</Label>
            <Textarea rows={2} value={form.summary} onChange={(e) => set("summary", e.target.value)} placeholder="What you do and what you're best at" />
          </div>
          <div>
            <Label>Skills</Label>
            <Textarea rows={2} value={form.skills} onChange={(e) => set("skills", e.target.value)} placeholder="React, Node, Postgres, AWS…" />
          </div>
          <div>
            <Label>Experience</Label>
            <Textarea rows={5} value={form.experience} onChange={(e) => set("experience", e.target.value)} placeholder={"Role @ Company (Jan 2023 – Present)\n- what you built, tech used, impact\n\nRole @ Company (2021 – 2023)\n- ..."} />
          </div>
          <div>
            <Label>Projects</Label>
            <Textarea rows={3} value={form.projects} onChange={(e) => set("projects", e.target.value)} placeholder="Name — description, tech, outcome, link" />
          </div>
          <div>
            <Label>Education</Label>
            <Textarea rows={2} value={form.education} onChange={(e) => set("education", e.target.value)} placeholder="B.E. CSE — Anna University (2024)" />
          </div>
          <div>
            <Label>Certifications</Label>
            <Textarea rows={2} value={form.certifications} onChange={(e) => set("certifications", e.target.value)} placeholder="AWS Solutions Architect, etc." />
          </div>
          <div>
            <Label>Writing tone</Label>
            <Select value={form.tone} onValueChange={(v) => setForm((f) => ({ ...f, tone: v as typeof form.tone }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["Impactful", "Formal", "Concise", "Creative"] as const).map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={submit} disabled={loading} size="lg">
            {loading ? <><Loader2 className="mr-2 size-4 animate-spin" /> Building…</> : <><Wand2 className="mr-2 size-4" /> Build with AI</>}
          </Button>
        </div>
      </div>

      <div className="lg:col-span-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <div className="flex gap-2">
            {(["modern", "classic", "minimal"] as const).map((t) => (
              <Button key={t} variant={template === t ? "default" : "outline"} size="sm" onClick={() => setTemplate(t)}>
                {t[0].toUpperCase() + t.slice(1)}
              </Button>
            ))}
          </div>
          {resume && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={downloadMd}>
                <Download className="mr-2 size-4" /> Markdown
              </Button>
              <Button size="sm" onClick={printPdf}>
                <Download className="mr-2 size-4" /> Print / PDF
              </Button>
            </div>
          )}
        </div>

        {resume ? (
          <div id="resume-print" className="rounded-2xl border bg-white text-neutral-900 shadow-sm print:border-0 print:shadow-none print:rounded-none">
            <ResumeTemplate resume={resume} template={template} />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed bg-card/40 p-12 text-center text-sm text-muted-foreground">
            Fill in the form and click <b>Build with AI</b> to preview your resume here.
          </div>
        )}
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #resume-print, #resume-print * { visibility: visible !important; }
          #resume-print { position: absolute; inset: 0; margin: 0; padding: 0; }
          @page { size: A4; margin: 14mm; }
        }
      `}</style>
    </div>
  );
}

function ResumeTemplate({ resume, template }: { resume: BuiltResume; template: Template }) {
  if (template === "classic") return <ClassicTpl r={resume} />;
  if (template === "minimal") return <MinimalTpl r={resume} />;
  return <ModernTpl r={resume} />;
}

function contactLine(r: BuiltResume) {
  return [r.contact.email, r.contact.phone, r.contact.location, ...(r.contact.links ?? [])]
    .filter(Boolean)
    .join(" · ");
}

function ModernTpl({ r }: { r: BuiltResume }) {
  return (
    <div className="p-8 font-sans">
      <div className="border-b-2 border-emerald-600 pb-4">
        <h1 className="text-3xl font-bold tracking-tight">{r.name}</h1>
        {r.title && <div className="text-emerald-700 font-medium">{r.title}</div>}
        <div className="mt-1 text-xs text-neutral-600">{contactLine(r)}</div>
      </div>
      {r.summary && <Sec title="Summary"><p className="text-sm leading-relaxed">{r.summary}</p></Sec>}
      {r.skills?.length > 0 && (
        <Sec title="Skills">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {r.skills.map((s, i) => (
              <div key={i}><span className="font-semibold">{s.group}:</span> {s.items.join(", ")}</div>
            ))}
          </div>
        </Sec>
      )}
      {r.experience?.length > 0 && (
        <Sec title="Experience">
          {r.experience.map((e, i) => (
            <div key={i} className="mb-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="font-semibold text-sm">{e.role} — <span className="text-emerald-700">{e.company}</span></div>
                <div className="text-xs text-neutral-600">{e.start} – {e.end}{e.location ? ` · ${e.location}` : ""}</div>
              </div>
              <ul className="mt-1 list-disc pl-5 text-sm space-y-0.5">
                {e.bullets.map((b, j) => <li key={j}>{b}</li>)}
              </ul>
            </div>
          ))}
        </Sec>
      )}
      {r.projects?.length > 0 && (
        <Sec title="Projects">
          {r.projects.map((p, i) => (
            <div key={i} className="mb-2 text-sm">
              <span className="font-semibold">{p.name}</span> — {p.description}
              {p.tech?.length > 0 && <span className="text-neutral-600"> ({p.tech.join(", ")})</span>}
              {p.link && <span className="text-emerald-700"> · {p.link}</span>}
            </div>
          ))}
        </Sec>
      )}
      {r.education?.length > 0 && (
        <Sec title="Education">
          {r.education.map((ed, i) => (
            <div key={i} className="text-sm">
              <span className="font-semibold">{ed.degree}</span> — {ed.school} <span className="text-neutral-600">({ed.year})</span>
              {ed.details && <div className="text-xs text-neutral-600">{ed.details}</div>}
            </div>
          ))}
        </Sec>
      )}
      {r.certifications?.length > 0 && (
        <Sec title="Certifications">
          <ul className="list-disc pl-5 text-sm">{r.certifications.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </Sec>
      )}
    </div>
  );
}

function ClassicTpl({ r }: { r: BuiltResume }) {
  return (
    <div className="p-8 font-serif">
      <div className="text-center">
        <h1 className="text-3xl font-bold uppercase tracking-wider">{r.name}</h1>
        {r.title && <div className="italic text-neutral-700">{r.title}</div>}
        <div className="mt-1 text-xs text-neutral-600">{contactLine(r)}</div>
      </div>
      <hr className="my-3 border-neutral-800" />
      {r.summary && <SecClassic title="Objective"><p className="text-sm">{r.summary}</p></SecClassic>}
      {r.skills?.length > 0 && (
        <SecClassic title="Skills">
          {r.skills.map((s, i) => <div key={i} className="text-sm"><b>{s.group}:</b> {s.items.join(", ")}</div>)}
        </SecClassic>
      )}
      {r.experience?.length > 0 && (
        <SecClassic title="Experience">
          {r.experience.map((e, i) => (
            <div key={i} className="mb-3">
              <div className="flex justify-between text-sm"><b>{e.role}, {e.company}</b><span>{e.start} – {e.end}</span></div>
              <ul className="mt-1 list-disc pl-5 text-sm">{e.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
            </div>
          ))}
        </SecClassic>
      )}
      {r.projects?.length > 0 && (
        <SecClassic title="Projects">
          {r.projects.map((p, i) => <div key={i} className="text-sm mb-1"><b>{p.name}.</b> {p.description} {p.tech?.length ? <i>({p.tech.join(", ")})</i> : null}</div>)}
        </SecClassic>
      )}
      {r.education?.length > 0 && (
        <SecClassic title="Education">
          {r.education.map((ed, i) => <div key={i} className="text-sm"><b>{ed.degree}</b>, {ed.school} — {ed.year}</div>)}
        </SecClassic>
      )}
      {r.certifications?.length > 0 && (
        <SecClassic title="Certifications">
          <ul className="list-disc pl-5 text-sm">{r.certifications.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </SecClassic>
      )}
    </div>
  );
}

function MinimalTpl({ r }: { r: BuiltResume }) {
  return (
    <div className="p-10 font-sans">
      <h1 className="text-4xl font-light tracking-tight">{r.name}</h1>
      {r.title && <div className="text-neutral-500 mt-1">{r.title}</div>}
      <div className="mt-2 text-xs text-neutral-500">{contactLine(r)}</div>
      {r.summary && <p className="mt-6 text-sm leading-relaxed">{r.summary}</p>}
      {r.skills?.length > 0 && (
        <div className="mt-6">
          <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-2">Skills</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {r.skills.flatMap((s) => s.items).map((x, i) => <span key={i}>{x}</span>)}
          </div>
        </div>
      )}
      {r.experience?.length > 0 && (
        <div className="mt-6">
          <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-2">Experience</div>
          {r.experience.map((e, i) => (
            <div key={i} className="mb-4">
              <div className="flex justify-between text-sm"><span><b>{e.role}</b> · {e.company}</span><span className="text-neutral-500">{e.start} – {e.end}</span></div>
              <ul className="mt-1 text-sm space-y-0.5">{e.bullets.map((b, j) => <li key={j}>— {b}</li>)}</ul>
            </div>
          ))}
        </div>
      )}
      {r.projects?.length > 0 && (
        <div className="mt-6">
          <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-2">Projects</div>
          {r.projects.map((p, i) => <div key={i} className="text-sm mb-1"><b>{p.name}</b> — {p.description}</div>)}
        </div>
      )}
      {r.education?.length > 0 && (
        <div className="mt-6">
          <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-2">Education</div>
          {r.education.map((ed, i) => <div key={i} className="text-sm">{ed.degree} · {ed.school} · {ed.year}</div>)}
        </div>
      )}
      {r.certifications?.length > 0 && (
        <div className="mt-6">
          <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-2">Certifications</div>
          <div className="text-sm">{r.certifications.join(" · ")}</div>
        </div>
      )}
    </div>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-700">{title}</h2>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
function SecClassic({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <h2 className="text-sm font-bold uppercase tracking-wide border-b border-neutral-400 mb-1">{title}</h2>
      {children}
    </div>
  );
}

