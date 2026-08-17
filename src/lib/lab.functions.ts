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

function parseJson<T>(text: string, fallback: T): T {
  const match = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/```([\s\S]*?)```/);
  const raw = (match ? match[1] : text).trim();
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const PERSONAS: Record<string, string> = {
  discussion: `You are moderating a group discussion. You play THREE voices: "Moderator", "Priya" and "Arjun" (two other participants with different viewpoints).
Respond in markdown where each speaker is a bold name followed by 1-3 sentences. Keep total under 140 words. React directly to the user's last point, add one new angle, and end with the Moderator inviting the user to respond or challenging them.`,
  phone: `You are an HR recruiter conducting a SHORT screening PHONE call. You cannot see the candidate. Speak naturally and conversationally in plain text (no markdown, no lists), 1-3 sentences at a time. Ask exactly one question per turn: start with a warm intro + "tell me about yourself", then cover notice period, salary expectations, relocation, and why this role. After ~6 exchanges, politely wrap up the call and say next steps.`,
  stress: `You are a deliberately tough STRESS interviewer. Be curt, skeptical and interrupt-y (never abusive or discriminatory). Challenge the candidate's answer, point out a weakness, apply time pressure, and fire the next hard question. Plain text, max 3 sentences. Every 4th turn, briefly acknowledge something good so it stays constructive.`,
};

export const labChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        mode: z.enum(["discussion", "phone", "stress"]),
        topic: z.string().max(200).optional(),
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
    const system = `${PERSONAS[data.mode]}${data.topic ? `\n\nTopic / role context: ${data.topic}` : ""}`;
    const { text } = await generateText({
      model: gateway(MODEL),
      system,
      messages: data.messages,
    });
    return { reply: text };
  });

export const generatePuzzle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        category: z.enum(["Logic", "Math", "Lateral thinking", "Estimation", "Coding logic"]),
        difficulty: z.enum(["Easy", "Medium", "Hard"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const gateway = getGateway();
    const { text } = await generateText({
      model: gateway(MODEL),
      prompt: `Create ONE ${data.difficulty} ${data.category} brain teaser of the kind asked in real job interviews.
Return ONLY JSON: {"puzzle":"<the puzzle, max 60 words>","hint":"<one short hint>"}`,
    });
    return parseJson<{ puzzle: string; hint: string }>(text, {
      puzzle: "You have two ropes that each burn in exactly 60 minutes but not uniformly. Measure 45 minutes.",
      hint: "You may light a rope at both ends.",
    });
  });

export const evaluatePuzzle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        puzzle: z.string().min(5).max(2000),
        answer: z.string().min(1).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const gateway = getGateway();
    const { text } = await generateText({
      model: gateway(MODEL),
      prompt: `Puzzle: ${data.puzzle}
Candidate's reasoning/answer: ${data.answer}

Evaluate like an interviewer who cares about the thought process more than the final answer.
Return ONLY JSON: {"score": <0-10 integer>, "verdict":"Correct|Partially correct|Incorrect", "feedback":"<2-3 sentences>", "solution":"<the ideal solution in 2-4 sentences>"}`,
    });
    return parseJson(text, {
      score: 5,
      verdict: "Partially correct",
      feedback: "Answer received.",
      solution: "—",
    });
  });

export const personalityAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        scores: z.object({
          openness: z.number().min(0).max(100),
          conscientiousness: z.number().min(0).max(100),
          extraversion: z.number().min(0).max(100),
          agreeableness: z.number().min(0).max(100),
          neuroticism: z.number().min(0).max(100),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const gateway = getGateway();
    const s = data.scores;
    const { text } = await generateText({
      model: gateway(MODEL),
      prompt: `A candidate completed a Big Five self-report. Percentile-style scores (0-100):
Openness ${s.openness}, Conscientiousness ${s.conscientiousness}, Extraversion ${s.extraversion}, Agreeableness ${s.agreeableness}, Emotional reactivity (Neuroticism) ${s.neuroticism}.

Return ONLY JSON:
{"disc":"D|I|S|C","discLabel":"<e.g. Influential Collaborator>","markdown":"<markdown report with sections: ## Your Profile, ## Strengths in Interviews, ## Watch-outs, ## Roles That Fit, ## How to Answer 'Describe yourself' — under 320 words>"}`,
    });
    return parseJson(text, {
      disc: "S",
      discLabel: "Steady Contributor",
      markdown: "## Your Profile\nReport unavailable — please try again.",
    });
  });

export const labInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ kind: z.enum(["consistency", "prediction", "highlights"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("interviews")
      .select("type,difficulty,overall_score,questions,created_at,status")
      .order("created_at", { ascending: false })
      .limit(15);
    if (error) throw new Error(error.message);

    const done = (rows ?? []).filter((r) => r.status === "completed");
    if (done.length === 0) {
      return {
        markdown:
          "## Not enough data yet\n\nComplete at least one interview and come back — this analysis is built entirely from your own answers.",
        score: null as number | null,
      };
    }

    const transcript = done
      .map((r, i) => {
        const qs = (r.questions as QAItem[]) ?? [];
        const body = qs
          .map(
            (q, j) =>
              `  Q${j + 1}: ${q.question}\n  A: ${q.answer ?? "(no answer)"}\n  Score: ${q.score ?? "-"}/10`,
          )
          .join("\n");
        return `Interview ${i + 1} (${r.type}/${r.difficulty}, overall ${r.overall_score}/10, ${new Date(
          r.created_at as string,
        ).toDateString()}):\n${body}`;
      })
      .join("\n\n");

    const prompts: Record<string, string> = {
      consistency: `You are an interview integrity analyst. Compare the candidate's answers ACROSS interviews and look for contradictions, shifting facts (years of experience, roles, projects, motivations), vague or evasive answers, and rehearsed-sounding claims that lack detail.
Return ONLY JSON: {"score": <0-100 consistency score>, "markdown":"<markdown with ## Consistency Score explanation, ## Contradictions Found (bullets quoting the conflicting answers, or 'None detected'), ## Evasive or Vague Answers, ## How to Fix It — under 350 words>"}`,
      prediction: `You are a hiring-outcome model. Estimate the candidate's probability of clearing a real interview based on their history.
Return ONLY JSON: {"score": <0-100 success probability>, "markdown":"<markdown with ## Verdict, ## What's Working, ## What's Blocking You, ## Biggest Lever (one change with the largest impact), ## Predicted Readiness Timeline — under 350 words>"}`,
      highlights: `You are an editor building a candidate 'highlight reel' — the strongest moments from their practice interviews.
Return ONLY JSON: {"score": <0-100 overall showreel strength>, "markdown":"<markdown with ## Your Highlight Reel — 4-6 numbered highlights, each quoting the candidate's actual answer (trimmed) with why it lands — then ## Signature Strengths and ## Use These In Your Next Interview — under 400 words>"}`,
    };

    const gateway = getGateway();
    const { text } = await generateText({
      model: gateway(MODEL),
      prompt: `${prompts[data.kind]}\n\nCandidate data:\n${transcript}`,
    });
    return parseJson<{ score: number | null; markdown: string }>(text, {
      score: null,
      markdown: text || "Analysis unavailable — please try again.",
    });
  });
