import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  getActionableBranches,
  getSkippedBranchIds,
  skipBranch,
  resetSkips,
  updateBranch,
} from "@/lib/supabase";
import type { ActionableBranch } from "@/lib/supabase";
import {
  Shuffle, CheckCircle2, RotateCcw, Flower2,
  ListTodo, BookOpen, AlertTriangle, Clock, Lightbulb, StickyNote,
  WifiOff, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEnergy } from "@/App";

const TYPE_ICONS: Record<string, any> = {
  subtask: ListTodo, resource: BookOpen, worry: AlertTriangle,
  waiting: Clock, idea: Lightbulb, note: StickyNote,
};
const TYPE_COLORS: Record<string, string> = {
  subtask: "#8b5cf6", resource: "#06b6d4", worry: "#f43f5e",
  waiting: "#eab308", idea: "#22c55e", note: "#3b82f6",
};
const ENERGY_LABELS: Record<string, { label: string; emoji: string; desc: string; glowClass: string; color: string }> = {
  fried: { label: "Fried", emoji: "🧠💤", desc: "Only showing easy, low-effort things", glowClass: "now-card-fried", color: "hsl(215 65% 62%)" },
  okay:  { label: "Okay",  emoji: "⚡",   desc: "Balanced mix of actions",              glowClass: "now-card-okay",  color: "hsl(270 85% 68%)" },
  wired: { label: "Wired", emoji: "🔥",   desc: "High energy — bring on the big stuff", glowClass: "now-card-wired", color: "hsl(20 95% 62%)" },
};

// Energy → Supabase filter value
function energyToFilter(energy: string): string {
  if (energy === "fried") return "low";
  if (energy === "wired") return "high";
  return "any";
}

// ── Skeletons ─────────────────────────────────────────────────────────────

function NowCardSkeleton() {
  return (
    <div className="rounded-3xl p-8 text-center border border-border bg-card animate-pulse">
      <div className="flex justify-center mb-6">
        <div className="w-14 h-14 rounded-2xl bg-muted" />
      </div>
      <div className="space-y-3 max-w-sm mx-auto">
        <div className="h-7 bg-muted rounded w-full" />
        <div className="h-7 bg-muted rounded w-4/5 mx-auto" />
        <div className="h-4 bg-muted rounded w-1/2 mx-auto mt-4" />
      </div>
      <div className="flex flex-col sm:flex-row gap-3 max-w-xs mx-auto mt-10">
        <div className="h-12 flex-1 bg-muted rounded-2xl" />
        <div className="h-12 flex-1 bg-muted rounded-2xl" />
      </div>
    </div>
  );
}

function BackupSkeleton() {
  return (
    <div className="space-y-2 mt-6">
      <div className="h-3 w-32 bg-muted rounded mb-3" />
      {[1, 2].map(i => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border animate-pulse">
          <div className="w-7 h-7 rounded-lg bg-muted shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-muted rounded w-3/4" />
            <div className="h-2.5 bg-muted rounded w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="bloom-in flex items-center gap-3 px-4 py-3 rounded-2xl border border-destructive/30 bg-destructive/8 text-sm text-destructive mb-6">
      <WifiOff size={15} className="shrink-0" />
      <span className="flex-1">
        <strong className="font-semibold">Couldn't load Now queue</strong> — check your Supabase connection
      </span>
      <button
        onClick={onRetry}
        className="flex items-center gap-1 text-xs font-semibold underline underline-offset-2 hover:no-underline shrink-0"
      >
        <RefreshCw size={11} /> Retry
      </button>
    </div>
  );
}

// ── NowCard ────────────────────────────────────────────────────────────────

function NowCard({ item, onDone, onSkip }: {
  item: ActionableBranch;
  onDone: () => void;
  onSkip: () => void;
}) {
  const { energy } = useEnergy();
  const em = ENERGY_LABELS[energy];
  const TypeIcon = TYPE_ICONS[item.type] ?? ListTodo;
  const typeColor = TYPE_COLORS[item.type] ?? "#8b5cf6";

  return (
    <div data-testid="now-card" className={`bloom-in rounded-3xl p-8 text-center border border-border bg-card ${em.glowClass}`}>
      <div className="flex justify-center mb-6">
        <div className="p-3 rounded-2xl" style={{ background: `${typeColor}20`, color: typeColor }}>
          <TypeIcon size={22} />
        </div>
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-3 leading-snug"
        style={{ fontFamily: 'Chillax, sans-serif' }} data-testid="now-action-text">
        {item.text}
      </h2>
      <p className="text-sm text-muted-foreground mb-8">
        from <span className="text-foreground font-medium">{item.bloomTitle}</span>
      </p>
      <div className="flex flex-col sm:flex-row gap-3 max-w-xs mx-auto">
        <Button data-testid="btn-done-now" onClick={onDone}
          className="flex-1 py-3 rounded-2xl font-bold text-base gap-2"
          style={{ background: em.color, color: "#fff", boxShadow: `0 0 30px ${em.color}50` }}>
          <CheckCircle2 size={18} /> Done ✓
        </Button>
        <Button data-testid="btn-skip-now" variant="outline" onClick={onSkip}
          className="flex-1 py-3 rounded-2xl font-semibold text-base gap-2 border-border hover:border-muted-foreground">
          <Shuffle size={16} /> Nope, reshuffle
        </Button>
      </div>
    </div>
  );
}

function BackupItem({ item, onSelect }: { item: ActionableBranch; onSelect: () => void }) {
  const TypeIcon = TYPE_ICONS[item.type] ?? ListTodo;
  const typeColor = TYPE_COLORS[item.type] ?? "#8b5cf6";
  return (
    <button data-testid={`backup-item-${item.id}`} onClick={onSelect}
      className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/30 transition-all text-left group">
      <div className="p-1.5 rounded-lg shrink-0" style={{ background: `${typeColor}18`, color: typeColor }}>
        <TypeIcon size={12} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{item.text}</p>
        <p className="text-xs text-muted-foreground">{item.bloomTitle}</p>
      </div>
      <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors">pick this →</span>
    </button>
  );
}

// ── NowPage ────────────────────────────────────────────────────────────────

export default function NowPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { energy } = useEnergy();
  const em = ENERGY_LABELS[energy];
  const [currentIndex, setCurrentIndex] = useState(0);

  const energyFilter = energyToFilter(energy);

  // Fetch all actionable branches filtered by energy
  const branchQuery = useQuery({
    queryKey: ["now-branches", energyFilter],
    queryFn: () => getActionableBranches(energyFilter),
    retry: 1,
  });

  // Fetch skipped branch IDs
  const skipsQuery = useQuery({
    queryKey: ["now-skips"],
    queryFn: getSkippedBranchIds,
    retry: 1,
  });

  const isLoading = branchQuery.isLoading || skipsQuery.isLoading;
  const isError = branchQuery.isError || skipsQuery.isError;

  // Client-side: filter out skipped branches
  const allBranches = branchQuery.data ?? [];
  const skippedIds = new Set(skipsQuery.data ?? []);
  const available = allBranches.filter(b => !skippedIds.has(b.id));
  const totalActionable = allBranches.length;
  const skippedCount = skippedIds.size;

  // Reset index when energy changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [energy]);

  useEffect(() => {
    if (isError) {
      toast({
        title: "Couldn't load Now queue",
        description: "Failed to reach Supabase — check your connection.",
        variant: "destructive",
      });
    }
  }, [isError]);

  const invalidateNow = () => {
    qc.invalidateQueries({ queryKey: ["now-branches"] });
    qc.invalidateQueries({ queryKey: ["now-skips"] });
  };

  const skip = useMutation({
    mutationFn: (branchId: number) => skipBranch(branchId),
    onSuccess: () => {
      invalidateNow();
      setCurrentIndex(0);
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't skip", description: err.message, variant: "destructive" });
    },
  });

  const done = useMutation({
    mutationFn: (branchId: number) => updateBranch(branchId, { isDone: true }),
    onSuccess: () => {
      invalidateNow();
      qc.invalidateQueries({ queryKey: ["blooms"] });
      toast({ title: "Done! 🎉", description: "One thing at a time. That's how it works." });
      setCurrentIndex(0);
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't mark done", description: err.message, variant: "destructive" });
    },
  });

  const reset = useMutation({
    mutationFn: resetSkips,
    onSuccess: () => {
      invalidateNow();
      setCurrentIndex(0);
      toast({ title: "Queue reset", description: "Everything is back in the pool." });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't reset queue", description: err.message, variant: "destructive" });
    },
  });

  const current = available[currentIndex];
  const backups = available.slice(currentIndex + 1, currentIndex + 3);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Chillax, sans-serif' }}>
            <span className="gradient-text">Now</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {em.emoji} {em.label} mode · {em.desc}
          </p>
        </div>
        {skippedCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => reset.mutate()} disabled={reset.isPending}
            className="gap-1.5 text-muted-foreground hover:text-foreground text-xs">
            <RotateCcw size={12} /> Reset queue
          </Button>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <>
          <NowCardSkeleton />
          <BackupSkeleton />
        </>
      )}

      {/* Error state */}
      {isError && (
        <ErrorBanner onRetry={() => { branchQuery.refetch(); skipsQuery.refetch(); }} />
      )}

      {/* No actionable items at all */}
      {!isLoading && !isError && totalActionable === 0 && (
        <div className="bloom-in text-center py-16 px-8 rounded-3xl border-2 border-dashed border-border">
          <div className="text-5xl mb-4 float">🌱</div>
          <h2 className="text-lg font-semibold text-foreground mb-2" style={{ fontFamily: 'Chillax, sans-serif' }}>
            Nothing marked as ready yet
          </h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto leading-relaxed">
            Go to a Bloom, open it, add some branches, and hit the ⚡ button to mark them as ready for Now.
          </p>
          <Link href="/">
            <Button className="gap-2 rounded-xl" style={{ background: "hsl(270 85% 68%)", color: "#fff" }}>
              <Flower2 size={15} /> Go to Blooms
            </Button>
          </Link>
        </div>
      )}

      {/* All skipped */}
      {!isLoading && !isError && totalActionable > 0 && available.length === 0 && (
        <div className="bloom-in text-center py-16 px-8 rounded-3xl border border-border bg-card">
          <div className="text-5xl mb-4">😤</div>
          <h2 className="text-lg font-semibold text-foreground mb-2" style={{ fontFamily: 'Chillax, sans-serif' }}>
            You've shuffled through everything
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {skippedCount} action{skippedCount !== 1 ? "s" : ""} skipped. Reset to see them again, or go add more branches.
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => reset.mutate()} disabled={reset.isPending}
              className="gap-2 rounded-xl" style={{ background: "hsl(270 85% 68%)", color: "#fff" }}>
              <RotateCcw size={14} /> Reset queue
            </Button>
            <Link href="/">
              <Button variant="outline" className="gap-2 rounded-xl border-border">
                <Flower2 size={14} /> Back to Blooms
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* The Now card */}
      {!isLoading && !isError && current && (
        <>
          <NowCard
            item={current}
            onDone={() => done.mutate(current.id)}
            onSkip={() => skip.mutate(current.id)}
          />
          <p className="text-center text-xs text-muted-foreground mt-4">
            {available.length} option{available.length !== 1 ? "s" : ""} available
            {skippedCount > 0 && ` · ${skippedCount} skipped`}
          </p>
          {backups.length > 0 && (
            <div className="mt-6 bloom-in">
              <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wider">Or if not that…</p>
              <div className="space-y-2">
                {backups.map(b => (
                  <BackupItem key={b.id} item={b} onSelect={() => {
                    const idx = available.findIndex(a => a.id === b.id);
                    if (idx >= 0) setCurrentIndex(idx);
                  }} />
                ))}
              </div>
            </div>
          )}
          <div className="mt-8 p-4 rounded-2xl bg-muted/50 border border-border text-center">
            <p className="text-xs text-muted-foreground leading-relaxed">
              You only need to do <strong className="text-foreground">one thing</strong>. That's it. Just this.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
