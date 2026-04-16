import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Plus, GitBranch, Trash2, Zap, Sparkles, WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEnergy } from "@/App";
import {
  getBlooms, getBranches, createBloom, deleteBloom,
  type Bloom, type Branch,
} from "@/lib/supabase";

const BLOOM_COLORS = [
  "#8b5cf6", "#06b6d4", "#f97316", "#22c55e",
  "#ec4899", "#eab308", "#3b82f6", "#f43f5e",
];
const ENERGY_OPTS = [
  { value: "any",    label: "Any energy", emoji: "✨" },
  { value: "low",    label: "Low",        emoji: "🧠💤" },
  { value: "medium", label: "Medium",     emoji: "⚡" },
  { value: "high",   label: "High",       emoji: "🔥" },
];

// ── Skeletons ────────────────────────────────────────────────────────────

function BloomCardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-3 h-3 rounded-full mt-1.5 bg-muted shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-3 bg-muted rounded w-1/2" />
        </div>
      </div>
      <div className="h-3 bg-muted rounded w-16" />
      <div className="flex gap-2 mt-auto pt-1">
        <div className="h-9 flex-1 bg-muted rounded-xl" />
        <div className="h-9 w-9 bg-muted rounded-xl" />
      </div>
    </div>
  );
}

function ErrorBanner({ endpoint, onRetry }: { endpoint: string; onRetry: () => void }) {
  return (
    <div className="bloom-in flex items-center gap-3 px-4 py-3 rounded-2xl border border-destructive/30 bg-destructive/8 text-sm text-destructive mb-6">
      <WifiOff size={15} className="shrink-0" />
      <span className="flex-1">
        <strong className="font-semibold">Error</strong> — couldn't reach{" "}
        <code className="font-mono text-xs bg-destructive/15 px-1.5 py-0.5 rounded">{endpoint}</code>
      </span>
      <button onClick={onRetry} className="flex items-center gap-1 text-xs font-semibold underline underline-offset-2 hover:no-underline shrink-0">
        <RefreshCw size={11} /> Retry
      </button>
    </div>
  );
}

// ── BloomCard ─────────────────────────────────────────────────────────────

function BloomCard({ bloom, onDelete }: { bloom: Bloom; onDelete: () => void }) {
  const { toast } = useToast();

  const branchQuery = useQuery<Branch[]>({
    queryKey: ["branches", bloom.id],
    queryFn: () => getBranches(bloom.id),
    retry: 1,
  });

  useEffect(() => {
    if (branchQuery.isError) {
      toast({
        title: "Couldn't load branches",
        description: `blooms/${bloom.id}/branches — ${(branchQuery.error as Error)?.message}`,
        variant: "destructive",
      });
    }
  }, [branchQuery.isError]);

  const branches = branchQuery.data ?? [];
  const actionableCount = branches.filter(b => b.isActionable && !b.isDone).length;

  return (
    <div
      data-testid={`bloom-card-${bloom.id}`}
      className="bloom-card bloom-in bg-card border border-border rounded-2xl p-5 flex flex-col gap-3"
      style={{ borderColor: `${bloom.color}30` }}
    >
      <div className="flex items-start gap-3">
        <div className="w-3 h-3 rounded-full mt-1.5 shrink-0 float"
          style={{ background: bloom.color, boxShadow: `0 0 10px ${bloom.color}60` }} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-base leading-snug" style={{ fontFamily: 'Chillax, sans-serif' }}>
            {bloom.title}
          </p>
          {bloom.feeling && (
            <p className="text-sm text-muted-foreground mt-1 italic leading-relaxed">"{bloom.feeling}"</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {branchQuery.isLoading ? (
          <div className="h-3 w-16 bg-muted rounded animate-pulse" />
        ) : branchQuery.isError ? (
          <span className="flex items-center gap-1 text-destructive/70"><WifiOff size={10} /> load failed</span>
        ) : (
          <>
            <span>{branches.length} branch{branches.length !== 1 ? "es" : ""}</span>
            {actionableCount > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ background: `${bloom.color}20`, color: bloom.color, border: `1px solid ${bloom.color}40` }}>
                <Zap size={10} /> {actionableCount} ready
              </span>
            )}
          </>
        )}
      </div>

      <div className="flex gap-2 mt-auto pt-1">
        <Link href={`/branch/${bloom.id}`} className="flex-1">
          <button data-testid={`btn-branch-${bloom.id}`}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all"
            style={{ background: `${bloom.color}18`, color: bloom.color, border: `1px solid ${bloom.color}35` }}>
            <GitBranch size={14} /> Open & Branch
          </button>
        </Link>
        <button onClick={onDelete}
          className="p-2 rounded-xl border border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-all">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ── AddBloomDialog ────────────────────────────────────────────────────────

function AddBloomDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [feeling, setFeeling] = useState("");
  const [color, setColor] = useState(BLOOM_COLORS[0]);
  const [energyRequired, setEnergyRequired] = useState("any");

  const create = useMutation({
    mutationFn: () => createBloom({ title, feeling, color, energyRequired, isActive: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blooms"] });
      toast({ title: "✨ Bloom captured", description: title });
      onClose();
      setTitle(""); setFeeling(""); setColor(BLOOM_COLORS[0]); setEnergyRequired("any");
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't save bloom", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground text-lg" style={{ fontFamily: 'Chillax, sans-serif' }}>
            What's blooming in your mind?
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">No pressure. Half-formed thoughts welcome.</p>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <Input data-testid="input-bloom-title"
            placeholder="Anything — a project, a worry, an idea, a feeling..."
            value={title} autoFocus
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && title.trim()) create.mutate(); }}
            className="bg-secondary border-border text-foreground placeholder:text-muted-foreground text-base"
          />
          <Textarea data-testid="input-bloom-feeling"
            placeholder="How does it feel to think about this? (optional)"
            value={feeling} onChange={e => setFeeling(e.target.value)} rows={2}
            className="bg-secondary border-border text-foreground placeholder:text-muted-foreground resize-none text-sm"
          />
          <div>
            <p className="text-xs text-muted-foreground mb-2">Pick a color</p>
            <div className="flex gap-2 flex-wrap">
              {BLOOM_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-all ${color === c ? "ring-2 ring-white ring-offset-2 ring-offset-card scale-110" : "hover:scale-105"}`}
                  style={{ background: c, boxShadow: color === c ? `0 0 12px ${c}80` : undefined }} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2">How much energy does this need?</p>
            <div className="flex gap-2 flex-wrap">
              {ENERGY_OPTS.map(o => (
                <button key={o.value} onClick={() => setEnergyRequired(o.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    energyRequired === o.value
                      ? "bg-primary/20 text-primary border border-primary/40"
                      : "bg-secondary text-muted-foreground border border-transparent hover:border-border"
                  }`}>
                  {o.emoji} {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="ghost" onClick={onClose} className="text-muted-foreground flex-1">Not yet</Button>
            <Button data-testid="btn-save-bloom"
              onClick={() => create.mutate()}
              disabled={!title.trim() || create.isPending}
              className="flex-1 font-semibold"
              style={{ background: color, color: "#fff", boxShadow: `0 0 20px ${color}50` }}>
              {create.isPending ? "Capturing..." : "Capture it ✨"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── BloomPage ─────────────────────────────────────────────────────────────

export default function BloomPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const { data: blooms = [], isLoading, isError, error, refetch } = useQuery<Bloom[]>({
    queryKey: ["blooms"],
    queryFn: getBlooms,
    retry: 1,
  });

  useEffect(() => {
    if (isError) {
      toast({
        title: "Couldn't load your Blooms",
        description: (error as Error)?.message ?? "Unknown error",
        variant: "destructive",
      });
    }
  }, [isError]);

  const del = useMutation({
    mutationFn: (id: number) => deleteBloom(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blooms"] }),
    onError: (err: Error) => {
      toast({ title: "Couldn't delete bloom", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Chillax, sans-serif' }}>
            Your <span className="gradient-text">Blooms</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLoading ? "Loading your thoughts…" :
             isError ? "Couldn't connect to Supabase" :
             blooms.length === 0 ? "Nothing here yet. What's on your mind?" :
             `${blooms.length} thought${blooms.length > 1 ? "s" : ""} captured — tap one to branch it out.`}
          </p>
        </div>
        <Button data-testid="btn-add-bloom" onClick={() => setAddOpen(true)}
          className="gap-2 font-semibold rounded-xl"
          style={{ background: "hsl(270 85% 68%)", color: "#fff", boxShadow: "0 0 20px hsl(270 85% 68% / 0.35)" }}>
          <Plus size={16} /> Bloom
        </Button>
      </div>

      {isError && <ErrorBanner endpoint="supabase/blooms" onRetry={() => refetch()} />}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <BloomCardSkeleton key={i} />)}
        </div>
      )}

      {!isLoading && !isError && blooms.length === 0 && (
        <div className="bloom-in text-center py-20 px-8 rounded-3xl border border-border cursor-pointer group transition-all hover:border-primary/30"
          onClick={() => setAddOpen(true)}>
          <div className="text-6xl mb-4 float">🌸</div>
          <h2 className="text-lg font-semibold text-foreground mb-2" style={{ fontFamily: 'Chillax, sans-serif' }}>
            What's swirling in your head?
          </h2>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
            No categories. No due dates. No pressure.<br />
            Just capture whatever is alive in your mind right now.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 text-primary text-sm font-medium">
            <Sparkles size={14} /> Tap anywhere to bloom
          </div>
        </div>
      )}

      {!isLoading && !isError && blooms.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {blooms.map(bloom => (
            <BloomCard key={bloom.id} bloom={bloom} onDelete={() => del.mutate(bloom.id)} />
          ))}
          <button data-testid="btn-add-bloom-card" onClick={() => setAddOpen(true)}
            className="bloom-card border-2 border-dashed border-border rounded-2xl p-5 flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all min-h-[140px] group">
            <Plus size={18} className="group-hover:scale-110 transition-transform" />
            <span className="text-sm font-medium">New bloom</span>
          </button>
        </div>
      )}

      <AddBloomDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
