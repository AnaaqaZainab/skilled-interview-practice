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
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const gateway = getGateway();
    const prompt = `You are an interview generator. Create exactly 5 concise ${data.difficulty} difficulty interview questions for a ${data.type} interview. Return ONLY a JSON array of strings, e.g. ["Q1","Q2","Q3","Q4","Q5"]. No explanations, no numbering.`;

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

Return ONLY a JSON object of the form:
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
