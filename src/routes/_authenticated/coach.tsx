import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { careerCoach } from "@/lib/interview.functions";
import { Compass, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/coach")({
  component: CoachPage,
});

function CoachPage() {
  const coach = useServerFn(careerCoach);
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["coach", refreshKey],
    queryFn: () => coach(),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-emerald-glow text-primary-foreground">
              <Compass className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">AI Career Coach</h1>
              <p className="text-sm text-muted-foreground">
                Personalized skill gap analysis & study plan
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRefreshKey((k) => k + 1);
              refetch().catch((e) => toast.error(e?.message ?? "Failed"));
            }}
            disabled={isFetching}
          >
            <RefreshCw className={`mr-2 size-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="mt-6 rounded-2xl border border-border/60 bg-card/70 p-6 shadow-sm backdrop-blur-xl">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-primary">
              <ReactMarkdown>{data?.markdown ?? ""}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
