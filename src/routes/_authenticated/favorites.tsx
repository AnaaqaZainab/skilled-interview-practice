import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@tanstack/react-start";
import { listFavorites, removeFavorite, synthesizeSpeech } from "@/lib/interview.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, Star, Trash2, Volume2, Square } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/favorites")({
  component: FavoritesPage,
});

function FavoritesPage() {
  const fetchFavs = useServerFn(listFavorites);
  const unfav = useServerFn(removeFavorite);
  const speak = useServerFn(synthesizeSpeech);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const { data: favs = [], isLoading } = useQuery({
    queryKey: ["favorites"],
    queryFn: () => fetchFavs(),
  });

  let audioEl: HTMLAudioElement | null = null;

  async function play(question: string) {
    if (playingKey === question) {
      audioEl?.pause();
      audioEl = null;
      setPlayingKey(null);
      return;
    }
    setLoadingKey(question);
    try {
      const res = await speak({ data: { text: question, voice: "alloy" } });
      const a = new Audio(`data:${res.mimeType};base64,${res.audioBase64}`);
      audioEl = a;
      a.onended = () => setPlayingKey(null);
      await a.play();
      setPlayingKey(question);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "TTS failed");
    } finally {
      setLoadingKey(null);
    }
  }

  async function remove(question: string) {
    try {
      await unfav({ data: { question } });
      qc.invalidateQueries({ queryKey: ["favorites"] });
      toast.success("Removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  const filtered = favs.filter((f) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (
      f.question.toLowerCase().includes(s) ||
      (f.interview_type ?? "").toLowerCase().includes(s) ||
      (f.difficulty ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <AppShell>
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <Star className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Favorite Questions</h1>
          <p className="text-sm text-muted-foreground">
            {favs.length} saved question{favs.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="mt-6 relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search saved questions…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
            {favs.length === 0
              ? "No favorites yet. Tap the star icon on any question to save it."
              : "No matching questions."}
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((f) => (
              <li key={f.id} className="rounded-2xl border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base font-medium">{f.question}</p>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => play(f.question)}
                      disabled={loadingKey === f.question}
                      aria-label="Read aloud"
                    >
                      {loadingKey === f.question ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : playingKey === f.question ? (
                        <Square className="size-4" />
                      ) : (
                        <Volume2 className="size-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      onClick={() => remove(f.question)}
                      aria-label="Remove"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {f.interview_type && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                      {f.interview_type}
                    </span>
                  )}
                  {f.difficulty && (
                    <span className="rounded-full bg-muted px-2 py-0.5">{f.difficulty}</span>
                  )}
                  <span>· saved {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
