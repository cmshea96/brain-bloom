import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useParams, Link } from "wouter";
import {
  ArrowLeft, Plus, Zap, CheckCircle2, Circle, Trash2,
  BookOpen, AlertTriangle, Clock, Lightbulb, StickyNote, ListTodo,
  WifiOff, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getBloom, getBranches, createBranch, updateBranch, deleteBranch,
  type Bloom, type Branch,
} from "@/lib/supabase";

const BRANCH_TYPES = [
  { value: "subtask",  label: "Step",       plural: "Steps",      icon: ListTodo,      color: "#8b5cf6", desc: "Something to do" },
  { value: "resource", label: "Resource",   plural: "Resources",  icon: BookOpen,      color: "#06b6d4", desc: "Link, tool, person" },
  { value: "worry",    label: "Worry",      plural: "Worries",    icon: AlertTriangle, color: "#f43f5e", desc: "Get it out of your head" },
  { value: "waiting",  label: "Waiting on", plural: "Waiting On", icon: Clock,         color: "#eab308", desc: "Blocked on someone/thing" },
  { value: "idea",     label: "Idea",       plural: "Ideas",      icon: Lightbulb,     color: "#22c55e", desc: "Related spark" },
  { value: "note",     label: "Note",       plural: "Notes",      icon: StickyNote,    color: "#3b82f6", desc: "Context or reminder" },
];
const ENERGY_OPTS = [
  { value: "any",    label: "Any",    emoji: "✨" },
  { value: "low",    label: "Low",    emoji: "🧠💤" },
  { value: "medium", label: "Medium", emoji: "⚡" },
  { value: "high",   label: "High",   emoji: "🔥" },
];

function getBranchType(value: string) {
  return BRANCH_TYPES.find(t => t.value === value) ?? BRANCH_TYPES[0];
}

// ── Skeletons ─────────────────────────────────────────────────────────────

function BranchPageSkeleton() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 animate-pulse">
      <div className="h-4 w-28 bg-muted rounded mb-6" />
      <div className="flex items-start gap-3 mb-8">
        <div className="w-4 h-4 rounded-full bg-muted mt-2 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-6 bg-muted rounded w-2/3" />
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="h-3 bg-muted rounded w-24 mt-1" />
        </div>
      </div>
      <div className="h-24 bg-card border border-border rounded-2xl mb-6" />
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-start gap-3 p-4 rounded-2xl bg-card border border-border">
            <div className="w-9 h-9 rounded-xl bg-muted shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-3 bg-muted rounded w-1/3" />
            </div>
            <div className="flex gap-1">
              {[1,2,3].map(j => <div key={j} className="w-7 h-7 bg-muted rounded-lg" />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorBanner({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="bloom-in flex items-center gap-3 px-4 py-3 rounded-2xl border border-destructive/30 bg-destructive/8 text-sm text-destructive mb-6">
      <WifiOff size={15} className="shrink-0" />
      <span className="flex-1"><strong className="font-semibold">Error</strong> — {label}</span>
      <button onClick={onRetry} className="flex items-center gap-1 text-xs font-semibold underline underline-offset-2 hover:no-underline shrink-0">
        <RefreshCw size={11} /> Retry
      </button>
    </div>
  );
}

// ── BranchPill ────────────────────────────────────────────────────────────

function BranchPill({ branch, onToggleDone, onToggleActionable, onDelete }: {
  branch: Branch;
  onToggleDone: () => void;
  onToggleActionable: () => void;
  onDelete: () => void;
}) {
  const type = getBranchType(branch.type);
  const Icon = type.icon;
  return (
    <div data-testid={`branch-pill-${branch.id}`}
      className={`branch-pill flex items-start gap-3 p-4 rounded-2xl border transition-all ${branch.isDone ? "opacity-50 bg-muted/30 border-border" : "bg-card border-border hover:border-opacity-60"}`}
      style={!branch.isDone ? { borderColor: `${type.color}35` } : undefined}>
      <div className="p-2 rounded-xl shrink-0 mt-0.5" style={{ background: `${type.color}18`, color: type.color }}>
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-snug ${branch.isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {branch.text}
        </p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${type.color}15`, color: type.color }}>
            {type.label}
          </span>
          {branch.isActionable && !branch.isDone && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 flex items-center gap-1">
              <Zap size={9} /> Ready for Now
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {ENERGY_OPTS.find(e => e.value === branch.energyRequired)?.emoji}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button data-testid={`btn-actionable-${branch.id}`} onClick={onToggleActionable}
          className={`p-1.5 rounded-lg transition-colors ${branch.isActionable ? "text-primary" : "text-muted-foreground hover:text-primary"}`}>
          <Zap size={13} />
        </button>
        <button data-testid={`btn-done-branch-${branch.id}`} onClick={onToggleDone}
          className={`p-1.5 rounded-lg transition-colors ${branch.isDone ? "text-green-400" : "text-muted-foreground hover:text-green-400"}`}>
          {branch.isDone ? <CheckCircle2 size={13} /> : <Circle size={13} />}
        </button>
        <button data-testid={`btn-delete-branch-${branch.id}`} onClick={onDelete}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ── AddBranchRow ──────────────────────────────────────────────────────────

function AddBranchRow({ bloomId }: { bloomId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [type, setType] = useState("subtask");
  const [energy, setEnergy] = useState("any");
  const [actionable, setActionable] = useState(false);

  const selectedType = getBranchType(type);

  const create = useMutation({
    mutationFn: () => createBranch({
      bloomId, text: text.trim(), type, color: selectedType.color,
      isActionable: actionable, isDone: false, energyRequired: energy, posX: 0, posY: 0,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches", bloomId] });
      toast({ title: "Branch added" });
      setText(""); setActionable(false);
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't save branch", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex gap-2">
        <Input data-testid="input-branch-text"
          placeholder="Add a branch — step, worry, idea, resource..."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") create.mutate(); }}
          className="bg-secondary border-border text-foreground placeholder:text-muted-foreground flex-1"
        />
        <Button data-testid="btn-save-branch" onClick={() => create.mutate()}
          disabled={!text.trim() || create.isPending}
          className="shrink-0 rounded-xl" style={{ background: selectedType.color, color: "#fff" }}>
          <Plus size={16} />
        </Button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {BRANCH_TYPES.map(t => (
          <button key={t.value} data-testid={`branch-type-${t.value}`} onClick={() => setType(t.value)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition-all ${type === t.value ? "scale-105 shadow-sm" : "opacity-60 hover:opacity-90"}`}
            style={type === t.value
              ? { background: `${t.color}25`, color: t.color, border: `1px solid ${t.color}50` }
              : { background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))", border: "1px solid transparent" }}
            title={t.desc}>
            <t.icon size={11} /> {t.label}
          </button>
        ))}
        <div className="h-4 w-px bg-border mx-1" />
        {ENERGY_OPTS.map(o => (
          <button key={o.value} onClick={() => setEnergy(o.value)}
            className={`px-2 py-1 rounded-lg text-xs transition-all ${energy === o.value ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            title={o.label}>
            {o.emoji}
          </button>
        ))}
        <div className="h-4 w-px bg-border mx-1" />
        <button data-testid="btn-toggle-actionable" onClick={() => setActionable(a => !a)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition-all ${
            actionable ? "bg-primary/20 text-primary border border-primary/40" : "bg-secondary text-muted-foreground border border-transparent hover:border-border"
          }`}>
          <Zap size={11} /> {actionable ? "In Now ✓" : "Add to Now"}
        </button>
      </div>
    </div>
  );
}

// ── BranchPage ────────────────────────────────────────────────────────────

export default function BranchPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const bloomId = parseInt(params.id);

  const bloomQuery = useQuery<Bloom>({
    queryKey: ["bloom", bloomId],
    queryFn: () => getBloom(bloomId),
    retry: 1,
  });

  const branchQuery = useQuery<Branch[]>({
    queryKey: ["branches", bloomId],
    queryFn: () => getBranches(bloomId),
    retry: 1,
  });

  useEffect(() => {
    if (bloomQuery.isError) {
      toast({ title: "Couldn't load bloom", description: (bloomQuery.error as Error)?.message, variant: "destructive" });
    }
  }, [bloomQuery.isError]);

  useEffect(() => {
    if (branchQuery.isError) {
      toast({ title: "Couldn't load branches", description: (branchQuery.error as Error)?.message, variant: "destructive" });
    }
  }, [branchQuery.isError]);

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<{ isDone: boolean; isActionable: boolean }> }) =>
      updateBranch(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["branches", bloomId] }),
    onError: (err: Error) => {
      toast({ title: "Couldn't update branch", description: err.message, variant: "destructive" });
    },
  });

  const del = useMutation({
    mutationFn: (id: number) => deleteBranch(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["branches", bloomId] }),
    onError: (err: Error) => {
      toast({ title: "Couldn't delete branch", description: err.message, variant: "destructive" });
    },
  });

  if (bloomQuery.isLoading || branchQuery.isLoading) return <BranchPageSkeleton />;

  const bloom = bloomQuery.data;
  const branches: Branch[] = branchQuery.data ?? [];
  const active = branches.filter(b => !b.isDone);
  const done = branches.filter(b => b.isDone);
  const actionable = active.filter(b => b.isActionable);

  if (bloomQuery.isError || !bloom) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/"><button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"><ArrowLeft size={14} /> Back to Blooms</button></Link>
        <ErrorBanner label={`Couldn't load bloom — ${(bloomQuery.error as Error)?.message}`} onRetry={() => bloomQuery.refetch()} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <Link href="/">
          <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 group">
            <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" /> Back to Blooms
          </button>
        </Link>
        <div className="flex items-start gap-3">
          <div className="w-4 h-4 rounded-full mt-2 shrink-0 float"
            style={{ background: bloom.color, boxShadow: `0 0 14px ${bloom.color}70` }} />
          <div>
            <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Chillax, sans-serif' }}>{bloom.title}</h1>
            {bloom.feeling && <p className="text-sm text-muted-foreground italic mt-1">"{bloom.feeling}"</p>}
            <p className="text-xs text-muted-foreground mt-2">
              {active.length} branch{active.length !== 1 ? "es" : ""}
              {actionable.length > 0 && ` · ${actionable.length} ready for Now`}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <AddBranchRow bloomId={bloomId} />

        {branchQuery.isError && (
          <ErrorBanner label={`Couldn't load branches — ${(branchQuery.error as Error)?.message}`} onRetry={() => branchQuery.refetch()} />
        )}

        {!branchQuery.isError && branches.length === 0 && (
          <div className="text-center py-10 text-muted-foreground bloom-in">
            <div className="text-4xl mb-3">🌿</div>
            <p className="text-sm">No branches yet. Add steps, worries, ideas — anything connected to this bloom.</p>
          </div>
        )}

        {BRANCH_TYPES.map(typeConfig => {
          const group = active.filter(b => b.type === typeConfig.value);
          if (group.length === 0) return null;
          const Icon = typeConfig.icon;
          return (
            <div key={typeConfig.value}>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg" style={{ background: `${typeConfig.color}20`, color: typeConfig.color }}><Icon size={12} /></div>
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: typeConfig.color }}>{typeConfig.plural}</span>
              </div>
              <div className="space-y-2">
                {group.map(branch => (
                  <BranchPill key={branch.id} branch={branch}
                    onToggleDone={() => update.mutate({ id: branch.id, data: { isDone: !branch.isDone } })}
                    onToggleActionable={() => update.mutate({ id: branch.id, data: { isActionable: !branch.isActionable } })}
                    onDelete={() => del.mutate(branch.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {done.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <CheckCircle2 size={12} /> Done ({done.length})
            </p>
            <div className="space-y-2">
              {done.map(branch => (
                <BranchPill key={branch.id} branch={branch}
                  onToggleDone={() => update.mutate({ id: branch.id, data: { isDone: false } })}
                  onToggleActionable={() => update.mutate({ id: branch.id, data: { isActionable: !branch.isActionable } })}
                  onDelete={() => del.mutate(branch.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {actionable.length > 0 && (
        <div className="mt-8 bloom-in rounded-2xl p-5 flex items-center justify-between"
          style={{ background: `${bloom.color}12`, border: `1px solid ${bloom.color}35` }}>
          <div>
            <p className="text-sm font-semibold text-foreground">{actionable.length} thing{actionable.length > 1 ? "s" : ""} ready for Now</p>
            <p className="text-xs text-muted-foreground mt-0.5">Jump to Now to pick one and do it</p>
          </div>
          <Link href="/now">
            <Button className="rounded-xl font-semibold gap-2" style={{ background: bloom.color, color: "#fff" }}>
              <Zap size={14} /> Go to Now
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
