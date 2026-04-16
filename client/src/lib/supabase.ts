import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Type helpers ──────────────────────────────────────────────────────────
// Converts Supabase snake_case rows → camelCase app types

export interface Bloom {
  id: number;
  title: string;
  feeling: string | null;
  color: string;
  energyRequired: string;
  isActive: boolean;
  createdAt: string;
}

export interface Branch {
  id: number;
  bloomId: number;
  text: string;
  type: string;
  color: string;
  isActionable: boolean;
  isDone: boolean;
  energyRequired: string;
  posX: number;
  posY: number;
  createdAt: string;
}

export type ActionableBranch = Branch & { bloomTitle: string };

function bloomFromRow(r: any): Bloom {
  return {
    id: r.id,
    title: r.title,
    feeling: r.feeling ?? null,
    color: r.color,
    energyRequired: r.energy_required,
    isActive: r.is_active,
    createdAt: r.created_at,
  };
}

function branchFromRow(r: any): Branch {
  return {
    id: r.id,
    bloomId: r.bloom_id,
    text: r.text,
    type: r.type,
    color: r.color,
    isActionable: r.is_actionable,
    isDone: r.is_done,
    energyRequired: r.energy_required,
    posX: r.pos_x,
    posY: r.pos_y,
    createdAt: r.created_at,
  };
}

// ── Bloom queries ─────────────────────────────────────────────────────────

export async function getBlooms(): Promise<Bloom[]> {
  const { data, error } = await supabase
    .from("blooms")
    .select("*")
    .order("id", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(bloomFromRow);
}

export async function getBloom(id: number): Promise<Bloom> {
  const { data, error } = await supabase
    .from("blooms")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return bloomFromRow(data);
}

export async function createBloom(input: {
  title: string;
  feeling?: string;
  color: string;
  energyRequired: string;
  isActive: boolean;
}): Promise<Bloom> {
  const { data, error } = await supabase
    .from("blooms")
    .insert({
      title: input.title,
      feeling: input.feeling ?? "",
      color: input.color,
      energy_required: input.energyRequired,
      is_active: input.isActive,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return bloomFromRow(data);
}

export async function deleteBloom(id: number): Promise<void> {
  const { error } = await supabase.from("blooms").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Branch queries ────────────────────────────────────────────────────────

export async function getBranches(bloomId: number): Promise<Branch[]> {
  const { data, error } = await supabase
    .from("branches")
    .select("*")
    .eq("bloom_id", bloomId)
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(branchFromRow);
}

export async function createBranch(input: {
  bloomId: number;
  text: string;
  type: string;
  color: string;
  isActionable: boolean;
  isDone: boolean;
  energyRequired: string;
  posX: number;
  posY: number;
}): Promise<Branch> {
  const { data, error } = await supabase
    .from("branches")
    .insert({
      bloom_id: input.bloomId,
      text: input.text,
      type: input.type,
      color: input.color,
      is_actionable: input.isActionable,
      is_done: input.isDone,
      energy_required: input.energyRequired,
      pos_x: input.posX,
      pos_y: input.posY,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return branchFromRow(data);
}

export async function updateBranch(
  id: number,
  updates: Partial<{ isDone: boolean; isActionable: boolean }>
): Promise<Branch> {
  const row: any = {};
  if (updates.isDone !== undefined) row.is_done = updates.isDone;
  if (updates.isActionable !== undefined) row.is_actionable = updates.isActionable;

  const { data, error } = await supabase
    .from("branches")
    .update(row)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return branchFromRow(data);
}

export async function deleteBranch(id: number): Promise<void> {
  const { error } = await supabase.from("branches").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Now queue ─────────────────────────────────────────────────────────────

export async function getSkippedBranchIds(): Promise<number[]> {
  const { data, error } = await supabase.from("now_skips").select("branch_id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => r.branch_id);
}

export async function getActionableBranches(
  energyFilter: string
): Promise<ActionableBranch[]> {
  let q = supabase
    .from("branches")
    .select("*, blooms!inner(title)")
    .eq("is_actionable", true)
    .eq("is_done", false);

  if (energyFilter !== "any") {
    q = q.or(`energy_required.eq.any,energy_required.eq.${energyFilter}`);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return (data ?? []).map((r: any) => ({
    ...branchFromRow(r),
    bloomTitle: r.blooms?.title ?? "Unknown",
  }));
}

export async function skipBranch(branchId: number): Promise<void> {
  const { error } = await supabase
    .from("now_skips")
    .insert({ branch_id: branchId });
  if (error) throw new Error(error.message);
}

export async function resetSkips(): Promise<void> {
  const { error } = await supabase.from("now_skips").delete().neq("id", 0);
  if (error) throw new Error(error.message);
}
