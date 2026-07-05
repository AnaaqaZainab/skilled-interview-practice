import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { listInterviews } from "@/lib/interview.functions";
import { useQuery } from "@tanstack/react-query";
import { Award, PlayCircle, TrendingUp, Clock, Trophy } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
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

  return (
    <AppShell>
      <div>
        <h1 className="text-3xl font-bold">
          Welcome, <span className="text-primary">{name || "there"}</span>
        </h1>
        <p className="mt-1 text-muted-foreground">Ready to sharpen your interview skills?</p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
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

      <div className="mt-10">
        <h2 className="text-lg font-semibold">Recent sessions</h2>
        <div className="mt-3 rounded-2xl border bg-card">
          {interviews.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No interviews yet. Start your first one!
            </div>
          ) : (
            <ul className="divide-y">
              {interviews.slice(0, 8).map((i) => (
                <li key={i.id} className="flex items-center justify-between px-5 py-4">
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
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
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
