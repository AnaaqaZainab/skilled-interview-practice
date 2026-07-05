import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Brain, MessageSquare, Mic, Sparkles, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen bg-hero-gradient">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-lg bg-emerald-glow text-primary-foreground shadow-md">
            <Brain className="size-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">PrepSage</span>
        </div>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link to="/auth" search={{ mode: "login" }}>
              Login
            </Link>
          </Button>
          <Button asChild>
            <Link to="/auth" search={{ mode: "register" }}>
              Register
            </Link>
          </Button>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 pt-16 pb-24 text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="size-3" /> Powered by AI
        </div>
        <h1 className="mt-6 text-balance text-5xl font-bold tracking-tight sm:text-6xl">
          Ace your next interview with{" "}
          <span className="bg-emerald-glow bg-clip-text text-transparent">AI-powered practice</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-muted-foreground">
          Practice HR, Technical, Biotechnology, and TNPSC interviews. Get instant feedback,
          scoring, and personalized suggestions from an AI interviewer.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="h-12 px-8 text-base">
            <Link to="/auth" search={{ mode: "register" }}>
              Start Interview
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base">
            <Link to="/auth" search={{ mode: "login" }}>
              I already have an account
            </Link>
          </Button>
        </div>

        <div className="mt-20 grid gap-6 sm:grid-cols-3">
          {[
            {
              icon: MessageSquare,
              title: "Realistic Q&A",
              desc: "AI-generated questions tailored to your interview type and difficulty.",
            },
            {
              icon: Mic,
              title: "Voice or Text",
              desc: "Type your answer or speak it — we'll transcribe and score it.",
            },
            {
              icon: TrendingUp,
              title: "Track Progress",
              desc: "See scores, feedback, and improvement suggestions after every session.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border bg-card p-6 text-left shadow-sm"
            >
              <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
