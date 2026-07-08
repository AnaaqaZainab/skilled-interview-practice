import { Link } from "@tanstack/react-router";
import { Brain, LogOut, Star, Sparkles, Compass, Map, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/theme-toggle";
import type { ReactNode } from "react";

const NAV: { to: "/resume" | "/coach" | "/chat" | "/favorites" | "/roadmap"; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { to: "/resume", label: "Resume", icon: FileText },
  { to: "/coach", label: "Coach", icon: Compass },
  { to: "/chat", label: "Mentor", icon: Sparkles },
  { to: "/favorites", label: "Favorites", icon: Star },
  { to: "/roadmap", label: "Roadmap", icon: Map },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-hero-gradient">
      <header className="border-b bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-lg bg-emerald-glow text-primary-foreground">
              <Brain className="size-5" />
            </div>
            <span className="text-lg font-semibold">PrepSage</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            {NAV.map((n) => (
              <div key={n.to}>
                <Button variant="ghost" size="sm" asChild className="hidden md:inline-flex">
                  <Link to={n.to}>
                    <n.icon className="mr-2 size-4" /> {n.label}
                  </Link>
                </Button>
                <Button variant="ghost" size="icon" asChild className="md:hidden size-9" aria-label={n.label}>
                  <Link to={n.to}>
                    <n.icon className="size-4" />
                  </Link>
                </Button>
              </div>
            ))}
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/";
              }}
            >
              <LogOut className="size-4 sm:mr-2" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}

