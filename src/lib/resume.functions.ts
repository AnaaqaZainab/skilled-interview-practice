import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableGateway } from "./ai-gateway.server";

const MODEL = "google/gemini-3-flash-preview";

function getGateway() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return createLovableGateway(key);
}

async function safeJson<T>(text: string, fallback: T): Promise<T> {
  const match = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/```([\s\S]*?)```/);
  const raw = (match ? match[1] : text).trim();
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function extractText(base64: string, mimeType: string, filename: string): Promise<string> {
  const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const lower = filename.toLowerCase();
  if (mimeType.includes("wordprocessingml") || lower.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const buf = Buffer.from(bin);
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value;
  }
  if (mimeType === "text/plain" || lower.endsWith(".txt")) {
    return new TextDecoder().decode(bin);
  }
  // PDF (and fallback): use Gemini multimodal file block to extract raw text
  const key = process.env.LOVABLE_API_KEY!;
  const dataUrl = `data:${mimeType || "application/pdf"};base64,${base64}`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract ALL text from this resume verbatim. Preserve section headings, bullet points, dates, and job titles. Output plain text only, no commentary.",
            },
            { type: "file", file: { filename, file_data: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`PDF extraction failed: ${res.status} ${await res.text().catch(() => "")}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}

type ResumeAnalysis = {
  ats_score: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  missing_keywords: string[];
  skill_gaps: string[];
  improvement_suggestions: string[];
  skills: string[];
  experience: Array<{ role: string; company: string; duration: string; highlights: string[] }>;
  projects: Array<{ name: string; description: string; tech: string[] }>;
};

export const analyzeResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        filename: z.string().min(1).max(200),
        mimeType: z.string().min(1).max(200),
        fileBase64: z.string().min(10),
        targetRole: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const text = (await extractText(data.fileBase64, data.mimeType, data.filename)).slice(0, 30000);
    if (!text.trim()) throw new Error("Could not extract any text from the file.");

    const gateway = getGateway();
    const prompt = `You are an expert technical recruiter and ATS specialist. Analyze this resume${
      data.targetRole ? ` for a "${data.targetRole}" role` : ""
    }.

Resume:
"""
${text}
"""

Return ONLY a JSON object with this exact shape:
{
  "ats_score": <0-100 integer>,
  "summary": "<2 sentence overall summary>",
  "strengths": ["<3-5 bullets>"],
  "weaknesses": ["<3-5 bullets>"],
  "missing_keywords": ["<5-10 keywords the resume should include for ATS>"],
  "skill_gaps": ["<3-5 skill areas to develop>"],
  "improvement_suggestions": ["<5-7 concrete edits>"],
  "skills": ["<extracted skills>"],
  "experience": [{"role":"","company":"","duration":"","highlights":["",""]}],
  "projects": [{"name":"","description":"","tech":[""]}]
}`;

    const { text: raw } = await generateText({ model: gateway(MODEL), prompt });
    const analysis = await safeJson<ResumeAnalysis>(raw, {
      ats_score: 0,
      summary: "Analysis unavailable.",
      strengths: [],
      weaknesses: [],
      missing_keywords: [],
      skill_gaps: [],
      improvement_suggestions: [],
      skills: [],
      experience: [],
      projects: [],
    });

    const { data: row, error } = await context.supabase
      .from("resumes" as never)
      .insert({
        user_id: context.userId,
        filename: data.filename,
        parsed_text: text,
        analysis,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id, analysis };
  });

export const listResumes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("resumes" as never)
      .select("id,filename,analysis,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      filename: string;
      analysis: ResumeAnalysis | null;
      created_at: string;
    }>;
  });

export const deleteResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("resumes" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const generateResumeInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        resumeId: z.string().uuid(),
        focus: z.enum(["resume", "projects", "experience"]).default("resume"),
        difficulty: z.enum(["Easy", "Medium", "Hard"]).default("Medium"),
        type: z.enum(["HR", "Technical", "Biotechnology", "TNPSC"]).default("Technical"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("resumes" as never)
      .select("parsed_text")
      .eq("id", data.resumeId)
      .single();
    if (error) throw new Error(error.message);
    const parsed = (row as { parsed_text: string }).parsed_text;

    const focusHint =
      data.focus === "projects"
        ? "Focus questions on the PROJECTS in the resume — dig into decisions, tradeoffs, and results."
        : data.focus === "experience"
          ? "Focus questions on the WORK EXPERIENCE — responsibilities, impact, and lessons learned."
          : "Cover the resume broadly — skills, projects, and experience.";

    const gateway = getGateway();
    const prompt = `Generate exactly 5 ${data.difficulty} ${data.type} interview questions personalized to this candidate.
${focusHint}
Return ONLY a JSON array of strings.

Resume:
"""
${parsed.slice(0, 15000)}
"""`;
    const { text } = await generateText({ model: gateway(MODEL), prompt });
    const questions = await safeJson<string[]>(text, []);
    const clean = (questions.length ? questions : ["Walk me through your resume."]).slice(0, 5);

    const { data: iv, error: ivErr } = await context.supabase
      .from("interviews")
      .insert({
        user_id: context.userId,
        type: data.type,
        difficulty: data.difficulty,
        status: "in_progress",
        questions: clean.map((q) => ({ question: q })),
      })
      .select("id")
      .single();
    if (ivErr) throw new Error(ivErr.message);
    return { id: iv.id as string };
  });

export type BuiltResume = {
  name: string;
  title: string;
  contact: { email?: string; phone?: string; location?: string; links?: string[] };
  summary: string;
  skills: Array<{ group: string; items: string[] }>;
  experience: Array<{
    role: string;
    company: string;
    location?: string;
    start: string;
    end: string;
    bullets: string[];
  }>;
  projects: Array<{ name: string; description: string; tech: string[]; link?: string }>;
  education: Array<{ degree: string; school: string; year: string; details?: string }>;
  certifications: string[];
};

function resumeToMarkdown(r: BuiltResume): string {
  const contactBits = [r.contact.email, r.contact.phone, r.contact.location, ...(r.contact.links ?? [])].filter(Boolean);
  const lines: string[] = [];
  lines.push(`# ${r.name}`);
  if (r.title) lines.push(`_${r.title}_`);
  if (contactBits.length) lines.push(contactBits.join(" · "));
  if (r.summary) { lines.push("", "## Professional Summary", r.summary); }
  if (r.skills?.length) {
    lines.push("", "## Skills");
    r.skills.forEach((s) => lines.push(`- **${s.group}:** ${s.items.join(", ")}`));
  }
  if (r.experience?.length) {
    lines.push("", "## Experience");
    r.experience.forEach((e) => {
      lines.push(`**${e.role} — ${e.company}** _(${e.start} – ${e.end})_${e.location ? ` · ${e.location}` : ""}`);
      e.bullets.forEach((b) => lines.push(`- ${b}`));
      lines.push("");
    });
  }
  if (r.projects?.length) {
    lines.push("## Projects");
    r.projects.forEach((p) => {
      lines.push(`**${p.name}** — ${p.description}${p.tech?.length ? ` _(${p.tech.join(", ")})_` : ""}${p.link ? ` — ${p.link}` : ""}`);
    });
    lines.push("");
  }
  if (r.education?.length) {
    lines.push("## Education");
    r.education.forEach((ed) => lines.push(`**${ed.degree}** — ${ed.school} _(${ed.year})_${ed.details ? ` · ${ed.details}` : ""}`));
    lines.push("");
  }
  if (r.certifications?.length) {
    lines.push("## Certifications");
    r.certifications.forEach((c) => lines.push(`- ${c}`));
  }
  return lines.join("\n");
}

export const buildResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).max(200),
        email: z.string().max(200).optional(),
        phone: z.string().max(50).optional(),
        location: z.string().max(200).optional(),
        links: z.string().max(500).optional(),
        targetRole: z.string().min(1).max(200),
        summary: z.string().max(2000).optional(),
        skills: z.string().max(2000).optional(),
        experience: z.string().max(5000).optional(),
        projects: z.string().max(5000).optional(),
        education: z.string().max(2000).optional(),
        certifications: z.string().max(1000).optional(),
        tone: z.enum(["Impactful", "Formal", "Concise", "Creative"]).default("Impactful"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const gateway = getGateway();
    const prompt = `You are an elite technical resume writer and ATS specialist. Build a polished, ATS-friendly resume for a "${data.targetRole}" role. Voice: ${data.tone}.

Rules:
- Rewrite every bullet using strong action verbs and QUANTIFY impact (%, $, users, latency, throughput) when the candidate's input allows it. Never invent numbers or facts.
- Weave in role-relevant keywords naturally so ATS parsers rank it high.
- Keep bullets tight (max ~24 words), start with a verb, no first-person pronouns.
- Group skills into 3-6 sensible categories (e.g. Languages, Frameworks, Cloud, Tools).
- Infer sensible dates from the candidate's text if given; otherwise leave as "Present" / "".

Return ONLY a JSON object with this EXACT shape (no markdown, no commentary):
{
  "name": "",
  "title": "<the target role, or a tighter title>",
  "contact": { "email": "", "phone": "", "location": "", "links": ["github/…","linkedin/…"] },
  "summary": "<2-3 sentence value-driven summary>",
  "skills": [ { "group": "Languages", "items": ["…"] } ],
  "experience": [ { "role": "", "company": "", "location": "", "start": "", "end": "", "bullets": ["…"] } ],
  "projects":   [ { "name": "", "description": "", "tech": ["…"], "link": "" } ],
  "education":  [ { "degree": "", "school": "", "year": "", "details": "" } ],
  "certifications": ["…"]
}

Candidate raw input:
${JSON.stringify(data, null, 2)}`;

    const { text } = await generateText({ model: gateway(MODEL), prompt });
    const resume = await safeJson<BuiltResume>(text, {
      name: data.name,
      title: data.targetRole,
      contact: { email: data.email, phone: data.phone, location: data.location },
      summary: data.summary ?? "",
      skills: [],
      experience: [],
      projects: [],
      education: [],
      certifications: [],
    });
    return { resume, markdown: resumeToMarkdown(resume) };
  });
