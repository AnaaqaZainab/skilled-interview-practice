import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { listInterviews } from "@/lib/interview.functions";
import { useQuery } from "@tanstack/react-query";
import {
  Award, PlayCircle, TrendingUp, Clock, Trophy, Search, Flame, Target, Medal, Star as StarIcon, Zap,
} from "lucide-react";
import { formatDistanceToNow, format, startOfDay, subDays, isSameDay } from "date-fns";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";


export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type Badge = { key: string; label: string; icon: React.ComponentType<{ className?: string }>; earned: boolean; hint: string };

function Dashboard() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const fetchList = useServerFn(listInterviews);
  const { data: interviews = [] } = useQuery({
    queryKey: ["interviews"],
    queryFn: () => fetchList(),
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      const { data: p } = await supabase.from("profiles").select("name").eq("id", uid).single();
      setName(p?.name ?? data.user?.email?.split("@")[0] ?? "");
    })();
  }, []);

  const completed = interviews.filter((i) => i.status === "completed");
  const total = interviews.length;
  const avg =
    completed.length > 0
      ? (
          completed.reduce((a, i) => a + Number(i.overall_score ?? 0), 0) / completed.length
        ).toFixed(1)
      : "—";
  const recent = interviews[0];
  const best = completed.reduce((m, i) => Math.max(m, Number(i.overall_score ?? 0)), 0);

  const chartData = useMemo(() => {
    return [...completed]
      .reverse()
      .map((i, idx) => ({
        name: `#${idx + 1}`,
        date: format(new Date(i.created_at), "MMM d"),
        score: Number(i.overall_score ?? 0),
      }));
  }, [completed]);

  // XP & Level: 100 XP per completed interview + score*10 bonus
  const xp = completed.reduce((a, i) => a + 100 + Math.round(Number(i.overall_score ?? 0) * 10), 0);
  const level = Math.max(1, Math.floor(xp / 500) + 1);
  const xpInLevel = xp % 500;
  const xpPct = (xpInLevel / 500) * 100;

  // Streak: consecutive days ending today (or yesterday) with at least one interview
  const { streak, streakDays } = useMemo(() => {
    const days = new Set(completed.map((c) => startOfDay(new Date(c.created_at)).getTime()));
    let s = 0;
    for (let i = 0; i < 90; i++) {
      const d = startOfDay(subDays(new Date(), i)).getTime();
      if (days.has(d)) s++;
      else if (i > 0) break; // allow today gap
    }
    const last30 = Array.from({ length: 30 }).map((_, i) => {
      const d = subDays(new Date(), 29 - i);
      return { date: d, active: days.has(startOfDay(d).getTime()) };
    });
    return { streak: s, streakDays: last30 };
  }, [completed]);

  // Radar: average score per type
  const radarData = useMemo(() => {
    const types = ["HR", "Technical", "Biotechnology", "TNPSC"];
    return types.map((t) => {
      const rows = completed.filter((c) => c.type === t);
      const avgT = rows.length
        ? rows.reduce((a, r) => a + Number(r.overall_score ?? 0), 0) / rows.length
        : 0;
      return { type: t, score: Number(avgT.toFixed(2)) };
    });
  }, [completed]);

  const badges: Badge[] = [
    { key: "first", label: "First Steps", icon: PlayCircle, earned: completed.length >= 1, hint: "Complete 1 interview" },
    { key: "five", label: "Getting Serious", icon: Flame, earned: completed.length >= 5, hint: "Complete 5 interviews" },
    { key: "ten", label: "Marathoner", icon: Medal, earned: completed.length >= 10, hint: "Complete 10 interviews" },
    { key: "highscore", label: "Sharpshooter", icon: Target, earned: best >= 8, hint: "Score 8+ in one interview" },
    { key: "perfect", label: "Ace", icon: Trophy, earned: best >= 9.5, hint: "Score 9.5+ in one interview" },
    { key: "allTypes", label: "Well-Rounded", icon: StarIcon, earned: new Set(completed.map((c) => c.type)).size >= 4, hint: "Try all 4 interview types" },
    { key: "streak3", label: "On Fire", icon: Flame, earned: streak >= 3, hint: "3-day practice streak" },
    { key: "streak7", label: "Unstoppable", icon: Zap, earned: streak >= 7, hint: "7-day practice streak" },
  ];



  const filtered = interviews.filter((i) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (
      i.type.toLowerCase().includes(s) ||
      i.difficulty.toLowerCase().includes(s) ||
      i.status.toLowerCase().includes(s)
    );
  });

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">
          Welcome, <span className="text-primary">{name || "there"}</span>
        </h1>
        <p className="mt-1 text-muted-foreground">Ready to sharpen your interview skills?</p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon={Trophy} label="Total Interviews" value={String(total)} />
        <StatCard icon={TrendingUp} label="Average Score" value={avg === "—" ? avg : `${avg}/10`} />
        <StatCard
          icon={Clock}
          label="Recent Interview"
          value={recent ? `${recent.type} · ${recent.difficulty}` : "None yet"}
          sub={recent ? formatDistanceToNow(new Date(recent.created_at), { addSuffix: true }) : ""}
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button size="lg" onClick={() => navigate({ to: "/setup" })}>
          <PlayCircle className="mr-2 size-5" /> Start New Interview
        </Button>
        {recent?.status === "completed" && (
          <Button size="lg" variant="outline" asChild>
            <Link to="/result/$id" params={{ id: recent.id }}>
              <Award className="mr-2 size-5" /> View Latest Results
            </Link>
          </Button>
        )}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border bg-card p-5 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold">Progress</h2>
          <p className="text-xs text-muted-foreground">Score over your last {chartData.length} interviews</p>
          <div className="mt-4 h-64">
            {chartData.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                Complete an interview to see your progress.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 10]} fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--card-foreground)",
                    }}
                  />
                  <Line type="monotone" dataKey="score" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Achievements</h2>
          <p className="text-xs text-muted-foreground">Earn badges as you practice</p>
          <ul className="mt-4 grid grid-cols-2 gap-3">
            {badges.map((b) => (
              <li
                key={b.key}
                title={b.hint}
                className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition ${
                  b.earned ? "bg-primary/10 border-primary/40" : "opacity-50"
                }`}
              >
                <b.icon className={`size-6 ${b.earned ? "text-primary" : "text-muted-foreground"}`} />
                <div className="text-xs font-medium">{b.label}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-emerald-glow text-primary-foreground">
              <Zap className="size-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Level</div>
              <div className="text-2xl font-bold">Lv {level}</div>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{xpInLevel} XP</span>
              <span>{500 - xpInLevel} to Lv {level + 1}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-emerald-glow transition-all" style={{ width: `${xpPct}%` }} />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">Total {xp} XP earned</div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-orange-500/15 text-orange-500">
              <Flame className="size-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Practice streak</div>
              <div className="text-2xl font-bold">{streak} day{streak === 1 ? "" : "s"}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-15 gap-1" style={{ gridTemplateColumns: "repeat(15, minmax(0, 1fr))" }}>
            {streakDays.map((d, i) => (
              <div
                key={i}
                title={format(d.date, "MMM d")}
                className={`aspect-square rounded-sm ${
                  d.active
                    ? isSameDay(d.date, new Date())
                      ? "bg-primary ring-2 ring-primary/30"
                      : "bg-primary/70"
                    : "bg-muted"
                }`}
              />
            ))}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Last 30 days</div>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Skill Radar</h2>
          <p className="text-xs text-muted-foreground">Average score by category</p>
          <div className="mt-2 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="70%">
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="type" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <PolarRadiusAxis angle={90} domain={[0, 10]} tick={false} axisLine={false} />
                <Radar dataKey="score" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.35} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>


      <div className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Interview history</h2>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by type, difficulty…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full pl-9 sm:w-72"
            />
          </div>
        </div>
        <div className="mt-3 rounded-2xl border bg-card">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {interviews.length === 0 ? "No interviews yet. Start your first one!" : "No matching interviews."}
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
                  <div>
                    <div className="font-medium">
                      {i.type} · {i.difficulty}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(i.created_at), { addSuffix: true })} ·{" "}
                      {i.status === "completed" ? "Completed" : "In progress"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {i.status === "completed" && (
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                        {Number(i.overall_score ?? 0).toFixed(1)}/10
                      </span>
                    )}
                    <Button asChild size="sm" variant="outline">
                      <Link
                        to={i.status === "completed" ? "/result/$id" : "/interview/$id"}
                        params={{ id: i.id }}
                      >
                        {i.status === "completed" ? "View" : "Resume"}
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
      <div className="mt-3 text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
