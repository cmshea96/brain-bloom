iimport { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  getActionableBranches, getSkippedBranchIds,
  skipBranch, resetSkips, updateBranch,
} from "@/lib/supabase";
import type { ActionableBranch } from "@/lib/supabase";
import {
  Shuffle, CheckCircle2, RotateCcw, Flower2,
  ListTodo, BookOpen, AlertTriangle, Clock, Lightbulb, StickyNote,
  WifiOff, RefreshCw, Play, Pause, Volume2, VolumeX, Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEnergy } from "@/App";

// ── Constants ──────────────────────────────────────────────────────────────

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

const FOCUS_PRESETS = [15, 25, 45];
const DEFAULT_FOCUS_MINS = 25;
const BREAK_MINS = 10;

type TimerPhase = "idle" | "focus" | "break-pulse" | "break" | "break-end";

function energyToFilter(energy: string): string {
  if (energy === "fried") return "low";
  if (energy === "wired") return "high";
  return "any";
}

// ── Web Audio chime ────────────────────────────────────────────────────────

function playChime(type: "focus-end" | "break-end") {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes = type === "focus-end"
      ? [523.25, 659.25, 783.99]   // C5 E5 G5 — gentle rising chord
      : [783.99, 659.25, 523.25];  // G5 E5 C5 — descending, "come back"

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.22;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.start(t);
      osc.stop(t + 0.65);
    });
  } catch (_) { /* silently fail if audio not available */ }
}

// ── CircularTimer ──────────────────────────────────────────────────────────

function CircularTimer({ seconds, total, color, phase }: {
  seconds: number; total: number; color: string; phase: TimerPhase;
}) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? seconds / total : 0;
  const dashOffset = circumference * (1 - progress);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <div className="relative flex items-center justify-center w-36 h-36 mx-auto mb-6">
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 120 120">
        {/* Track */}
        <circle cx="60" cy="60" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
        {/* Progress */}
        <circle
          cx="60" cy="60" r={radius} fill="none"
          stroke={color} strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 1s linear", filter: `drop-shadow(0 0 8px ${color}80)` }}
        />
      </svg>
      <div className="text-center z-10">
        <div className="text-2xl font-bold text-foreground tabular-nums" style={{ fontFamily: 'Chillax, sans-serif' }}>
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {phase === "break" || phase === "break-pulse" ? "break" : "focus"}
        </div>
      </div>
    </div>
  );
}

// ── Skeletons ──────────────────────────────────────────────────────────────

function NowCardSkeleton() {
  return (
    <div className="rounded-3xl p-8 text-center border border-border bg-card animate-pulse">
      <div className="w-36 h-36 rounded-full bg-muted mx-auto mb-6" />
      <div className="space-y-3 max-w-sm mx-auto">
        <div className="h-7 bg-muted rounded w-full" />
        <div className="h-7 bg-muted rounded w-4/5 mx-auto" />
      </div>
      <div className="flex gap-3 max-w-xs mx-auto mt-8">
        <div className="h-12 flex-1 bg-muted rounded-2xl" />
        <div className="h-12 flex-1 bg-muted rounded-2xl" />
      </div>
    </div>
  );
}

function ErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="bloom-in flex items-center gap-3 px-4 py-3 rounded-2xl border border-destructive/30 bg-destructive/8 text-sm text-destructive mb-6">
      <WifiOff size={15} className="shrink-0" />
      <span className="flex-1"><strong className="font-semibold">Couldn't load Now queue</strong> — check your Supabase connection</span>
      <button onClick={onRetry} className="flex items-center gap-1 text-xs font-semibold underline underline-offset-2 hover:no-underline shrink-0">
        <RefreshCw size={11} /> Retry
      </button>
    </div>
  );
}

function BackupItem({ item, onSelect }: { item: ActionableBranch; onSelect: () => void }) {
  const TypeIcon = TYPE_ICONS[item.type] ?? ListTodo;
  const typeColor = TYPE_COLORS[item.type] ?? "#8b5cf6";
  return (
    <button onClick={onSelect}
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

// ── Main NowPage ───────────────────────────────────────────────────────────

export default function NowPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { energy } = useEnergy();
  const em = ENERGY_LABELS[energy];
  const energyFilter = energyToFilter(energy);

  // Queue state
  const [currentIndex, setCurrentIndex] = useState(0);

  // Timer state
  const [phase, setPhase] = useState<TimerPhase>("idle");
  const [focusMins, setFocusMins] = useState(DEFAULT_FOCUS_MINS);
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_FOCUS_MINS * 60);
  const [totalSeconds, setTotalSeconds] = useState(DEFAULT_FOCUS_MINS * 60);
  const [isPaused, setIsPaused] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [pulseCount, setPulseCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Queries
  const branchQuery = useQuery({
    queryKey: ["now-branches", energyFilter],
    queryFn: () => getActionableBranches(energyFilter),
    retry: 1,
  });
  const skipsQuery = useQuery({
    queryKey: ["now-skips"],
    queryFn: getSkippedBranchIds,
    retry: 1,
  });

  const isLoading = branchQuery.isLoading || skipsQuery.isLoading;
  const isError = branchQuery.isError || skipsQuery.isError;
  const allBranches = branchQuery.data ?? [];
  const skippedIds = new Set(skipsQuery.data ?? []);
  const available = allBranches.filter(b => !skippedIds.has(b.id));
  const totalActionable = allBranches.length;
  const skippedCount = skippedIds.size;
  const current = available[currentIndex];
  const backups = available.slice(currentIndex + 1, currentIndex + 3);

  // Reset index on energy change
  useEffect(() => { setCurrentIndex(0); }, [energy]);

  useEffect(() => {
    if (isError) toast({ title: "Couldn't load Now queue", description: "Failed to reach Supabase.", variant: "destructive" });
  }, [isError]);

  // ── Timer tick ────────────────────────────────────────────────────────────

  const clearTick = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const startTick = useCallback(() => {
    clearTick();
    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearTick();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearTick]);

  // Watch for timer hitting 0
  useEffect(() => {
    if (secondsLeft === 0) {
      if (phase === "focus") {
        // Focus ended → pulse screen then start break
        if (soundOn) playChime("focus-end");
        setPhase("break-pulse");
        setPulseCount(0);
      } else if (phase === "break") {
        // Break ended
        if (soundOn) playChime("break-end");
        setPhase("break-end");
      }
    }
  }, [secondsLeft, phase, soundOn]);

  // Handle break-pulse: show 3 pulses then auto-start break
  useEffect(() => {
    if (phase === "break-pulse") {
      const t = setTimeout(() => {
        const breakSecs = BREAK_MINS * 60;
        setSecondsLeft(breakSecs);
        setTotalSeconds(breakSecs);
        setPhase("break");
        startTick();
      }, 2800); // 2.8s pulse display
      return () => clearTimeout(t);
    }
  }, [phase, startTick]);

  // Cleanup on unmount
  useEffect(() => () => clearTick(), [clearTick]);

  // ── Timer controls ────────────────────────────────────────────────────────

  function startFocus(mins: number) {
    const secs = mins * 60;
    setFocusMins(mins);
    setSecondsLeft(secs);
    setTotalSeconds(secs);
    setIsPaused(false);
    setPhase("focus");
    clearTick();
    // Start after a frame so state settles
    setTimeout(() => startTick(), 50);
  }

  function togglePause() {
    if (isPaused) {
      startTick();
      setIsPaused(false);
    } else {
      clearTick();
      setIsPaused(true);
    }
  }

  function stopTimer() {
    clearTick();
    setPhase("idle");
    setIsPaused(false);
    setSecondsLeft(focusMins * 60);
    setTotalSeconds(focusMins * 60);
  }

  function continueSession() {
    startFocus(focusMins);
  }

  function switchTask() {
    stopTimer();
    setCurrentIndex(i => (i + 1) % Math.max(available.length, 1));
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  const invalidateNow = () => {
    qc.invalidateQueries({ queryKey: ["now-branches"] });
    qc.invalidateQueries({ queryKey: ["now-skips"] });
  };

  const skip = useMutation({
    mutationFn: (id: number) => skipBranch(id),
    onSuccess: () => { invalidateNow(); setCurrentIndex(0); stopTimer(); },
    onError: (err: Error) => toast({ title: "Couldn't skip", description: err.message, variant: "destructive" }),
  });

  const done = useMutation({
    mutationFn: (id: number) => updateBranch(id, { isDone: true }),
    onSuccess: () => {
      invalidateNow();
      qc.invalidateQueries({ queryKey: ["blooms"] });
      stopTimer();
      setCurrentIndex(0);
      toast({ title: "Done! 🎉", description: "One thing at a time. That's how it works." });
    },
    onError: (err: Error) => toast({ title: "Couldn't mark done", description: err.message, variant: "destructive" }),
  });

  const reset = useMutation({
    mutationFn: resetSkips,
    onSuccess: () => { invalidateNow(); setCurrentIndex(0); toast({ title: "Queue reset", description: "Everything is back in the pool." }); },
    onError: (err: Error) => toast({ title: "Couldn't reset queue", description: err.message, variant: "destructive" }),
  });

  // ── Derived colors ────────────────────────────────────────────────────────

  const timerColor = phase === "break" || phase === "break-pulse"
    ? "hsl(185 90% 48%)"   // teal for break
    : em.color;             // energy color for focus

  const TypeIcon = current ? (TYPE_ICONS[current.type] ?? ListTodo) : ListTodo;
  const typeColor = current ? (TYPE_COLORS[current.type] ?? "#8b5cf6") : "#8b5cf6";

  // ── Break pulse overlay ───────────────────────────────────────────────────

  if (phase === "break-pulse") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center text-center px-8"
        style={{
          background: "hsl(var(--background))",
          animation: "break-pulse-bg 2.8s ease-in-out",
        }}>
        <style>{`
          @keyframes break-pulse-bg {
            0%   { background-color: hsl(var(--background)); }
            30%  { background-color: hsl(185 90% 48% / 0.18); }
            60%  { background-color: hsl(185 90% 48% / 0.10); }
            100% { background-color: hsl(var(--background)); }
          }
          @keyframes pulse-ring {
            0%   { transform: scale(1);   opacity: 0.8; }
            50%  { transform: scale(1.15); opacity: 0.4; }
            100% { transform: scale(1);   opacity: 0.8; }
          }
        `}</style>
        <div className="relative flex items-center justify-center mb-8">
          <div className="w-32 h-32 rounded-full absolute"
            style={{ background: "hsl(185 90% 48% / 0.2)", animation: "pulse-ring 1.4s ease-in-out infinite" }} />
          <div className="w-24 h-24 rounded-full flex items-center justify-center text-5xl"
            style={{ background: "hsl(185 90% 48% / 0.15)", border: "2px solid hsl(185 90% 48% / 0.4)" }}>
            ✅
          </div>
        </div>
        <h2 className="text-3xl font-bold text-foreground mb-3" style={{ fontFamily: 'Chillax, sans-serif' }}>
          Time's up!
        </h2>
        <p className="text-muted-foreground text-base mb-2">You did it. Break starting in a moment…</p>
        <p className="text-sm text-muted-foreground opacity-60">Step away from the screen ☁️</p>
      </div>
    );
  }

  // ── Break screen ──────────────────────────────────────────────────────────

  if (phase === "break" || phase === "break-end") {
    const isEnded = phase === "break-end";
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center text-center px-8"
        style={{ background: "hsl(var(--background))" }}>
        <div className="max-w-sm w-full">
          <div className="mb-2 text-sm font-medium uppercase tracking-widest"
            style={{ color: "hsl(185 90% 48%)" }}>
            {isEnded ? "Break's over" : "Break time"}
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-6" style={{ fontFamily: 'Chillax, sans-serif' }}>
            {isEnded ? "Ready to keep going?" : "Step away. You've earned it."}
          </h2>

          {!isEnded && (
            <CircularTimer
              seconds={secondsLeft}
              total={BREAK_MINS * 60}
              color="hsl(185 90% 48%)"
              phase="break"
            />
          )}

          {isEnded && (
            <div className="text-5xl mb-8">🌿</div>
          )}

          <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
            {isEnded
              ? "Your brain is recharged. Same task, or try something fresh?"
              : "The task card is hidden so you're not tempted to peek. Just rest."}
          </p>

          <div className="flex flex-col gap-3">
            <Button onClick={continueSession}
              className="w-full py-3 rounded-2xl font-bold text-base gap-2"
              style={{ background: em.color, color: "#fff", boxShadow: `0 0 24px ${em.color}50` }}>
              <Play size={16} /> Same task — keep going
            </Button>
            <Button variant="outline" onClick={switchTask}
              className="w-full py-3 rounded-2xl font-semibold gap-2 border-border">
              <Shuffle size={15} /> Something new
            </Button>
            {!isEnded && (
              <button onClick={() => setPhase("break-end")}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-1">
                I'm ready early →
              </button>
            )}
          </div>

          <div className="mt-6 flex justify-center">
            <button onClick={() => setSoundOn(s => !s)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              {soundOn ? <Volume2 size={12} /> : <VolumeX size={12} />}
              {soundOn ? "Sound on" : "Sound off"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main Now view ─────────────────────────────────────────────────────────

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
        <div className="flex items-center gap-2">
          <button onClick={() => setSoundOn(s => !s)}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
          {skippedCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => reset.mutate()} disabled={reset.isPending}
              className="gap-1.5 text-muted-foreground hover:text-foreground text-xs">
              <RotateCcw size={12} /> Reset queue
            </Button>
          )}
        </div>
      </div>

      {/* Loading */}
      {isLoading && <NowCardSkeleton />}

      {/* Error */}
      {isError && <ErrorBanner onRetry={() => { branchQuery.refetch(); skipsQuery.refetch(); }} />}

      {/* Empty */}
      {!isLoading && !isError && totalActionable === 0 && (
        <div className="bloom-in text-center py-16 px-8 rounded-3xl border-2 border-dashed border-border">
          <div className="text-5xl mb-4">🌱</div>
          <h2 className="text-lg font-semibold text-foreground mb-2" style={{ fontFamily: 'Chillax, sans-serif' }}>
            Nothing marked as ready yet
          </h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto leading-relaxed">
            Go to a Bloom, open it, add some branches, and hit the ⚡ button to mark them as ready for Now.
          </p>
          <Link href="/"><Button className="gap-2 rounded-xl" style={{ background: "hsl(270 85% 68%)", color: "#fff" }}>
            <Flower2 size={15} /> Go to Blooms
          </Button></Link>
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
            {skippedCount} action{skippedCount !== 1 ? "s" : ""} skipped. Reset to see them again.
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => reset.mutate()} disabled={reset.isPending}
              className="gap-2 rounded-xl" style={{ background: "hsl(270 85% 68%)", color: "#fff" }}>
              <RotateCcw size={14} /> Reset queue
            </Button>
            <Link href="/"><Button variant="outline" className="gap-2 rounded-xl border-border">
              <Flower2 size={14} /> Back to Blooms
            </Button></Link>
          </div>
        </div>
      )}

      {/* Active task + timer */}
      {!isLoading && !isError && current && (
        <>
          <div data-testid="now-card"
            className={`bloom-in rounded-3xl p-8 text-center border border-border bg-card ${em.glowClass}`}>

            {/* Timer ring (shown when active) or task icon (idle) */}
            {phase === "focus" ? (
              <CircularTimer seconds={secondsLeft} total={totalSeconds} color={timerColor} phase={phase} />
            ) : (
              <div className="flex justify-center mb-6">
                <div className="p-3 rounded-2xl" style={{ background: `${typeColor}20`, color: typeColor }}>
                  <TypeIcon size={22} />
                </div>
              </div>
            )}

            <h2 className="text-2xl font-bold text-foreground mb-3 leading-snug"
              style={{ fontFamily: 'Chillax, sans-serif' }}>
              {current.text}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              from <span className="text-foreground font-medium">{current.bloomTitle}</span>
            </p>

            {/* Timer controls — idle */}
            {phase === "idle" && (
              <div className="mb-6">
                <p className="text-xs text-muted-foreground mb-3 flex items-center justify-center gap-1">
                  <Timer size={11} /> Focus for
                </p>
                <div className="flex gap-2 justify-center mb-4">
                  {FOCUS_PRESETS.map(m => (
                    <button key={m} onClick={() => setFocusMins(m)}
                      className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-all ${
                        focusMins === m
                          ? "text-white"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                      style={focusMins === m ? { background: em.color } : {}}>
                      {m}m
                    </button>
                  ))}
                </div>
                <Button onClick={() => startFocus(focusMins)}
                  className="w-full max-w-xs py-3 rounded-2xl font-bold text-base gap-2 mx-auto block"
                  style={{ background: em.color, color: "#fff", boxShadow: `0 0 24px ${em.color}50` }}>
                  <Play size={16} /> Start {focusMins}min focus
                </Button>
              </div>
            )}

            {/* Timer controls — active */}
            {phase === "focus" && (
              <div className="flex gap-3 max-w-xs mx-auto mb-6">
                <Button variant="outline" onClick={togglePause}
                  className="flex-1 py-3 rounded-2xl font-semibold gap-2 border-border">
                  {isPaused ? <><Play size={15} /> Resume</> : <><Pause size={15} /> Pause</>}
                </Button>
                <Button variant="outline" onClick={stopTimer}
                  className="px-4 py-3 rounded-2xl border-border text-muted-foreground hover:text-destructive hover:border-destructive/40">
                  ✕
                </Button>
              </div>
            )}

            {/* Done / Skip */}
            <div className="flex flex-col sm:flex-row gap-3 max-w-xs mx-auto">
              <Button data-testid="btn-done-now" onClick={() => done.mutate(current.id)}
                className="flex-1 py-3 rounded-2xl font-bold text-base gap-2"
                style={phase === "focus"
                  ? { background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }
                  : { background: em.color, color: "#fff", boxShadow: `0 0 30px ${em.color}50` }}>
                <CheckCircle2 size={18} /> Done ✓
              </Button>
              <Button data-testid="btn-skip-now" variant="outline"
                onClick={() => skip.mutate(current.id)}
                className="flex-1 py-3 rounded-2xl font-semibold text-base gap-2 border-border hover:border-muted-foreground">
                <Shuffle size={16} /> Nope
              </Button>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-4">
            {available.length} option{available.length !== 1 ? "s" : ""} available
            {skippedCount > 0 && ` · ${skippedCount} skipped`}
          </p>

          {/* Backups — hidden during active focus */}
          {phase === "idle" && backups.length > 0 && (
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
