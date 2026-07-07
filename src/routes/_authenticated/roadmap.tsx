import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import {
  Sparkles, Mic, Video, BarChart3, Trophy, Languages, Building2,
  Users, GraduationCap, Crown, Rocket, FileText, CheckCircle2, Circle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/roadmap")({
  component: RoadmapPage,
});

type Item = { label: string; done?: boolean };
type Section = { title: string; icon: React.ComponentType<{ className?: string }>; items: Item[] };

const SECTIONS: Section[] = [
  {
    title: "AI Smart Features",
    icon: Sparkles,
    items: [
      { label: "AI Mentor Chat (24/7)", done: true },
      { label: "AI Interview Summary", done: true },
      { label: "AI Skill Gap Analyzer", done: true },
      { label: "AI Personalized Study Plan", done: true },
      { label: "AI Career Coach", done: true },
      { label: "AI Follow-up Questions" },
      { label: "AI Detects Inconsistent Answers" },
      { label: "AI Mock HR with personalities (Friendly / Strict / Senior Manager)" },
      { label: "AI Daily Practice Questions" },
      { label: "AI Adaptive Difficulty" },
    ],
  },
  {
    title: "Resume & Portfolio",
    icon: FileText,
    items: [
      { label: "Resume ATS Score" },
      { label: "AI Resume Builder" },
      { label: "Portfolio Upload & Review" },
      { label: "GitHub Profile Analysis" },
      { label: "LinkedIn Profile Review" },
      { label: "Resume Version Comparison" },
      { label: "Cover Letter Generator" },
      { label: "Resume Keyword Optimizer" },
    ],
  },
  {
    title: "Advanced Voice",
    icon: Mic,
    items: [
      { label: "Filler Word Counter", done: true },
      { label: "Speaking Speed (WPM)", done: true },
      { label: "Voice Confidence Meter" },
      { label: "Pronunciation Score" },
      { label: "Voice Tone Detection" },
      { label: "Silence Detection" },
      { label: "Accent Feedback" },
    ],
  },
  {
    title: "Video Interview",
    icon: Video,
    items: [
      { label: "Webcam Interview Recording" },
      { label: "Eye Contact Tracking" },
      { label: "Face Attention Detection" },
      { label: "Smile & Expression Analysis" },
      { label: "Posture Detection" },
      { label: "Background Quality Check" },
      { label: "Dress Code Suggestions" },
      { label: "Replay Interview Recording" },
    ],
  },
  {
    title: "Analytics & Reports",
    icon: BarChart3,
    items: [
      { label: "Score Trend Chart", done: true },
      { label: "Skill Radar Chart", done: true },
      { label: "Practice Streak Calendar", done: true },
      { label: "XP & Level System", done: true },
      { label: "Heatmap of Weak Skills" },
      { label: "Compare Multiple Interviews" },
      { label: "AI Interview Ranking" },
      { label: "Detailed Analytics Report Export" },
    ],
  },
  {
    title: "Gamification",
    icon: Trophy,
    items: [
      { label: "Achievement Badges", done: true },
      { label: "XP & Levels", done: true },
      { label: "Practice Streak", done: true },
      { label: "Daily Challenges" },
      { label: "Coins & Rewards" },
      { label: "Leaderboard" },
      { label: "Weekly Missions" },
      { label: "Unlock Advanced Levels" },
      { label: "Share Achievements" },
    ],
  },
  {
    title: "Multi-language Support",
    icon: Languages,
    items: [
      { label: "English, Tamil, Hindi" },
      { label: "Live Translation" },
      { label: "Bilingual Interview Mode" },
      { label: "AI Pronunciation Coach" },
      { label: "Regional Accent Practice" },
    ],
  },
  {
    title: "Company-Specific Prep",
    icon: Building2,
    items: [
      { label: "Google, Microsoft, Amazon" },
      { label: "TCS, Infosys, Wipro, Accenture, Zoho" },
      { label: "Previous Interview Questions" },
      { label: "Hiring Pattern Insights" },
      { label: "Company-specific AI Interviewer" },
      { label: "Company Difficulty Level" },
    ],
  },
  {
    title: "Collaboration",
    icon: Users,
    items: [
      { label: "Mentor / Teacher / Recruiter Dashboards" },
      { label: "Share Interview Reports" },
      { label: "Peer Review" },
      { label: "Mock Interview with Friends" },
      { label: "Group Discussion Simulator" },
    ],
  },
  {
    title: "Learning Center",
    icon: GraduationCap,
    items: [
      { label: "Flashcards" },
      { label: "Daily Vocabulary" },
      { label: "Coding Challenges" },
      { label: "Aptitude Tests" },
      { label: "Communication Exercises" },
      { label: "STAR Method Practice" },
      { label: "Behavioral Question Library" },
      { label: "HR Tips" },
    ],
  },
  {
    title: "Premium",
    icon: Crown,
    items: [
      { label: "Calendar Integration" },
      { label: "Email Interview Reports" },
      { label: "Interview Reminders" },
      { label: "AI Salary Negotiation Simulator" },
      { label: "Offer Letter Readiness Score" },
      { label: "Job Readiness Index" },
      { label: "Internship Recommendations" },
      { label: "Personalized Learning Roadmap" },
    ],
  },
  {
    title: "Innovative & Rare",
    icon: Rocket,
    items: [
      { label: "AI Lie Detection (answer consistency)" },
      { label: "AI Puzzle & Brain Teaser Round" },
      { label: "AI Group Discussion Moderator" },
      { label: "Mock HR Phone Interview" },
      { label: "Stress Interview Mode" },
      { label: "Personality Assessment (Big Five / DISC)" },
      { label: "Interview Success Prediction" },
      { label: "AI Highlight Reel" },
      { label: "Virtual 3D Interview Room" },
    ],
  },
];

function RoadmapPage() {
  const total = SECTIONS.reduce((a, s) => a + s.items.length, 0);
  const done = SECTIONS.reduce((a, s) => a + s.items.filter((i) => i.done).length, 0);
  const pct = Math.round((done / total) * 100);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Product Roadmap</h1>
            <p className="mt-1 text-muted-foreground">
              Everything on the vision board — shipped, in progress, and coming soon.
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/70 px-5 py-3 text-right shadow-sm backdrop-blur-xl">
            <div className="text-xs text-muted-foreground">Overall progress</div>
            <div className="text-2xl font-bold text-primary">{pct}%</div>
            <div className="text-xs text-muted-foreground">
              {done} of {total} features
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {SECTIONS.map((s) => {
            const secDone = s.items.filter((i) => i.done).length;
            return (
              <div
                key={s.title}
                className="rounded-2xl border border-border/60 bg-card/70 p-5 shadow-sm backdrop-blur-xl transition hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                      <s.icon className="size-4" />
                    </div>
                    <h2 className="font-semibold">{s.title}</h2>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {secDone}/{s.items.length}
                  </span>
                </div>
                <ul className="mt-4 space-y-2 text-sm">
                  {s.items.map((it) => (
                    <li key={it.label} className="flex items-start gap-2">
                      {it.done ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                      ) : (
                        <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/40" />
                      )}
                      <span className={it.done ? "" : "text-muted-foreground"}>{it.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
