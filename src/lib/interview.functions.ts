import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableGateway } from "./ai-gateway.server";

const MODEL = "google/gemini-3-flash-preview";

type QAItem = {
  question: string;
  answer?: string;
  feedback?: string;
  score?: number;
  suggestions?: string;
};

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

export const createInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        type: z.enum(["HR", "Technical", "Biotechnology", "TNPSC"]),
        difficulty: z.enum(["Easy", "Medium", "Hard"]),
        language: z.string().min(2).max(40).default("English"),
        company: z.string().max(80).optional(),
        role: z.string().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const gateway = getGateway();
    const companyLine = data.company
      ? `The interview is specifically for a ${data.role ?? "candidate"} role at ${data.company}. Tailor questions to that company's known interview style, tech stack, products, and culture.`
      : "";
    const prompt = `You are an interview generator. Create exactly 5 concise ${data.difficulty} difficulty ${data.type} interview questions.
${companyLine}
Write every question in ${data.language}. Return ONLY a JSON array of strings, e.g. ["Q1","Q2","Q3","Q4","Q5"]. No explanations, no numbering.`;

    const { text } = await generateText({
      model: gateway(MODEL),
      prompt,
    });
    const questions = await safeJson<string[]>(text, []);
    const clean = (questions.length ? questions : [
      "Tell me about yourself.",
      "What are your strengths and weaknesses?",
      "Why do you want this role?",
      "Describe a challenging situation and how you handled it.",
      "Where do you see yourself in 5 years?",
    ]).slice(0, 5);

    const qa: QAItem[] = clean.map((q) => ({ question: q }));

    const { data: row, error } = await context.supabase
      .from("interviews")
      .insert({
        user_id: context.userId,
        type: data.type,
        difficulty: data.difficulty,
        status: "in_progress",
        questions: qa,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const getInterview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("interviews")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listInterviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("interviews")
      .select("id,type,difficulty,status,overall_score,created_at,completed_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const submitAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        index: z.number().int().min(0).max(20),
        answer: z.string().min(1).max(5000),
        language: z.string().min(2).max(40).default("English"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("interviews")
      .select("questions,type,difficulty")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    const qs = (row.questions as QAItem[]) ?? [];
    const item = qs[data.index];
    if (!item) throw new Error("Question not found");

    const gateway = getGateway();
    const prompt = `You are an expert ${row.type} interviewer evaluating a ${row.difficulty} level answer.

Question: ${item.question}
Candidate's answer: ${data.answer}

Write feedback and suggestions in ${data.language}. Return ONLY a JSON object of the form:
{"score": <0-10 integer>, "feedback": "<2-3 sentences of specific feedback>", "suggestions": "<1-2 concrete suggestions to improve>"}`;

    const { text } = await generateText({ model: gateway(MODEL), prompt });
    const parsed = await safeJson<{ score: number; feedback: string; suggestions: string }>(text, {
      score: 5,
      feedback: "Answer received.",
      suggestions: "Provide more detail and concrete examples.",
    });

    qs[data.index] = {
      ...item,
      answer: data.answer,
      feedback: parsed.feedback,
      score: Math.max(0, Math.min(10, Math.round(parsed.score))),
      suggestions: parsed.suggestions,
    };

    const { error: upErr } = await context.supabase
      .from("interviews")
      .update({ questions: qs })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    return qs[data.index];
  });

export const completeInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("interviews")
      .select("questions")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    const qs = (row.questions as QAItem[]) ?? [];
    const scored = qs.filter((q) => typeof q.score === "number");
    const overall = scored.length
      ? Number((scored.reduce((a, q) => a + (q.score ?? 0), 0) / scored.length).toFixed(2))
      : 0;

    const { error: upErr } = await context.supabase
      .from("interviews")
      .update({
        status: "completed",
        overall_score: overall,
        completed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    return { overall_score: overall };
  });

export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        audioBase64: z.string().min(10),
        mimeType: z.string().default("audio/webm"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const bin = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
    const ext =
      data.mimeType.includes("mp4") ? "mp4" :
      data.mimeType.includes("wav") ? "wav" :
      data.mimeType.includes("mpeg") ? "mp3" :
      "webm";
    const form = new FormData();
    form.append("model", "openai/gpt-4o-mini-transcribe");
    form.append("file", new Blob([bin], { type: data.mimeType }), `recording.${ext}`);

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Transcription failed: ${res.status} ${t}`);
    }
    const json = (await res.json()) as { text?: string };
    return { text: json.text ?? "" };
  });

export const synthesizeSpeech = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ text: z.string().min(1).max(2000), voice: z.string().default("alloy") }).parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: data.text,
        voice: data.voice,
        response_format: "mp3",
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`TTS failed: ${res.status} ${t}`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return { audioBase64: btoa(bin), mimeType: "audio/mpeg" };
  });

export const listFavorites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("favorite_questions")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        question: z.string().min(1).max(2000),
        interview_type: z.string().optional(),
        difficulty: z.string().optional(),
        interview_id: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("favorite_questions").upsert(
      {
        user_id: context.userId,
        question: data.question,
        interview_type: data.interview_type ?? null,
        difficulty: data.difficulty ?? null,
        interview_id: data.interview_id ?? null,
      },
      { onConflict: "user_id,question" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ question: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("favorite_questions")
      .delete()
      .eq("user_id", context.userId)
      .eq("question", data.question);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// AI Smart Features: Summary, Coach, Mentor Chat
// ============================================================

export const generateSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("interviews")
      .select("questions,type,difficulty,overall_score")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const qs = (row.questions as QAItem[]) ?? [];
    const transcript = qs
      .map(
        (q, i) =>
          `Q${i + 1}: ${q.question}\nA: ${q.answer ?? "(no answer)"}\nScore: ${q.score ?? "-"}/10\nFeedback: ${q.feedback ?? "-"}`,
      )
      .join("\n\n");

    const prompt = `You are an expert career coach reviewing a completed ${row.type} (${row.difficulty}) mock interview scoring ${row.overall_score}/10.

Transcript:
${transcript}

Write a concise performance report in markdown with these sections:
## Overall Impression
## Key Strengths (bullet points)
## Areas to Improve (bullet points)
## Recommended Next Steps (3 concrete actions)

Keep it under 300 words, be specific to what the candidate actually said.`;

    const gateway = getGateway();
    const { text } = await generateText({ model: gateway(MODEL), prompt });
    return { summary: text };
  });

export const careerCoach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("interviews")
      .select("type,difficulty,overall_score,questions,created_at")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);

    if (!rows || rows.length === 0) {
      return {
        markdown:
          "## Welcome!\n\nComplete at least one interview and come back — I'll analyze your answers and build a personalized career plan for you.",
      };
    }

    const digest = rows
      .map((r, i) => {
        const qs = (r.questions as QAItem[]) ?? [];
        const weak = qs
          .filter((q) => typeof q.score === "number" && (q.score ?? 10) < 7)
          .slice(0, 2)
          .map((q) => `    - Weak (${q.score}/10): ${q.question}`)
          .join("\n");
        return `Interview ${i + 1} — ${r.type}/${r.difficulty} — Overall ${r.overall_score}/10\n${weak}`;
      })
      .join("\n\n");

    const prompt = `You are a personal AI career coach. Based on the candidate's recent interview history below, produce a personalized markdown report with these sections:

## Skill Gap Analysis
Identify 3-5 concrete weak areas across their answers.

## Personalized Study Plan (Next 2 Weeks)
Give a day-by-day plan (Week 1 & Week 2) with specific topics and practice tasks.

## Career Guidance
2-3 paragraphs of encouragement + strategic direction based on the interview types they choose.

Data:
${digest}

Keep total under 500 words. Be specific and actionable.`;

    const gateway = getGateway();
    const { text } = await generateText({ model: gateway(MODEL), prompt });
    return { markdown: text };
  });

export const mentorChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        messages: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().min(1).max(4000),
            }),
          )
          .min(1)
          .max(40),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const gateway = getGateway();
    const system =
      "You are PrepSage Mentor — a warm, encouraging 24/7 interview coach. Give concise, actionable advice for interview prep (HR, Technical, Biotech, TNPSC). Use markdown lists when helpful. Ask a clarifying question if the user's request is vague.";
    const { text } = await generateText({
      model: gateway(MODEL),
      system,
      messages: data.messages,
    });
    return { reply: text };
  });

