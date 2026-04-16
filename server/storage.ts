import { createClient } from "@supabase/supabase-js";
import type {
  Bloom, InsertBloom,
  Branch, InsertBranch,
  NowSkip,
} from "@shared/schema";

// ── Supabase client ────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || "https://sjphxkwbqkilekhxpliz.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqcGh4a3dicWtpbGVraHhwbGl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0ODkyNTUsImV4cCI6MjA5MDA2NTI1NX0.XTRFMNBb0nk3uXUDwVEP-ILu0wewqAg5eAUX8yxSeXc";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Helper: camelCase ↔ snake_case mapping ─────────────────────────────────
function toSnake(obj: Record<string, any>): Record<string, any> {
  const map: Record<string, string> = {
    bloomId: "bloom_id", energyRequired: "energy_required",
    isActive: "is_active", isActionable: "is_actionable",
    isDone: "is_done", posX: "pos_x", posY: "pos_y",
    createdAt: "created_at", skippedAt: "skipped_at", branchId: "branch_id",
  };
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[map[k] ?? k] = v;
  }
  return out;
}

function toCamel<T>(row: Record<string, any>): T {
  const map: Record<string, string> = {
    bloom_id: "bloomId", energy_required: "energyRequired",
    is_active: "isActive", is_actionable: "isActionable",
    is_done: "isDone", pos_x: "posX", pos_y: "posY",
    created_at: "createdAt", skipped_at: "skippedAt", branch_id: "branchId",
    bloom_title: "bloomTitle",
  };
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    out[map[k] ?? k] = v;
  }
  return out as T;
}

function toCamelArray<T>(rows: Record<string, any>[]): T[] {
  return rows.map(r => toCamel<T>(r));
}

// ── Storage interface (now async) ──────────────────────────────────────────
export interface IStorage {
  getBlooms(): Promise<Bloom[]>;
  getBloom(id: number): Promise<Bloom | undefined>;
  createBloom(data: InsertBloom): Promise<Bloom>;
  updateBloom(id: number, data: Partial<Bloom>): Promise<Bloom | undefined>;
  deleteBloom(id: number): Promise<void>;

  getBranches(bloomId: number): Promise<Branch[]>;
  getActionableBranches(energyFilter?: string): Promise<(Branch & { bloomTitle: string })[]>;
  createBranch(data: InsertBranch): Promise<Branch>;
  updateBranch(id: number, data: Partial<Branch>): Promise<Branch | undefined>;
  deleteBranch(id: number): Promise<void>;

  getNowSkips(): Promise<NowSkip[]>;
  skipBranch(branchId: number): Promise<NowSkip>;
  clearSkips(): Promise<void>;
}

export class SupabaseStorage implements IStorage {
  // ── Blooms ───────────────────────────────────────────────────────────────

  async getBlooms(): Promise<Bloom[]> {
    const { data, error } = await supabase
      .from("blooms")
      .select("*")
      .order("id", { ascending: false });
    if (error) throw error;
    return toCamelArray<Bloom>(data ?? []);
  }

  async getBloom(id: number): Promise<Bloom | undefined> {
    const { data, error } = await supabase
      .from("blooms")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? toCamel<Bloom>(data) : undefined;
  }

  async createBloom(input: InsertBloom): Promise<Bloom> {
    const row = toSnake(input as any);
    const { data, error } = await supabase
      .from("blooms")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return toCamel<Bloom>(data);
  }

  async updateBloom(id: number, updates: Partial<Bloom>): Promise<Bloom | undefined> {
    const row = toSnake(updates as any);
    const { data, error } = await supabase
      .from("blooms")
      .update(row)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data ? toCamel<Bloom>(data) : undefined;
  }

  async deleteBloom(id: number): Promise<void> {
    // Branches cascade via FK, but let's be explicit
    await supabase.from("branches").delete().eq("bloom_id", id);
    const { error } = await supabase.from("blooms").delete().eq("id", id);
    if (error) throw error;
  }

  // ── Branches ─────────────────────────────────────────────────────────────

  async getBranches(bloomId: number): Promise<Branch[]> {
    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .eq("bloom_id", bloomId)
      .order("id", { ascending: true });
    if (error) throw error;
    return toCamelArray<Branch>(data ?? []);
  }

  async getActionableBranches(energyFilter?: string): Promise<(Branch & { bloomTitle: string })[]> {
    // Get actionable, not-done branches
    let q = supabase
      .from("branches")
      .select("*, blooms!inner(title)")
      .eq("is_actionable", true)
      .eq("is_done", false);

    if (energyFilter && energyFilter !== "any") {
      q = q.or(`energy_required.eq.any,energy_required.eq.${energyFilter}`);
    }

    const { data, error } = await q;
    if (error) throw error;

    return (data ?? []).map((row: any) => {
      const branch = toCamel<Branch & { bloomTitle: string }>(row);
      // Supabase nests the join as `blooms: { title: "..." }`
      branch.bloomTitle = row.blooms?.title ?? "Unknown";
      return branch;
    });
  }

  async createBranch(input: InsertBranch): Promise<Branch> {
    const row = toSnake(input as any);
    const { data, error } = await supabase
      .from("branches")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return toCamel<Branch>(data);
  }

  async updateBranch(id: number, updates: Partial<Branch>): Promise<Branch | undefined> {
    const row = toSnake(updates as any);
    const { data, error } = await supabase
      .from("branches")
      .update(row)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data ? toCamel<Branch>(data) : undefined;
  }

  async deleteBranch(id: number): Promise<void> {
    const { error } = await supabase.from("branches").delete().eq("id", id);
    if (error) throw error;
  }

  // ── Now skips ────────────────────────────────────────────────────────────

  async getNowSkips(): Promise<NowSkip[]> {
    const { data, error } = await supabase.from("now_skips").select("*");
    if (error) throw error;
    return toCamelArray<NowSkip>(data ?? []);
  }

  async skipBranch(branchId: number): Promise<NowSkip> {
    const { data, error } = await supabase
      .from("now_skips")
      .insert({ branch_id: branchId })
      .select()
      .single();
    if (error) throw error;
    return toCamel<NowSkip>(data);
  }

  async clearSkips(): Promise<void> {
    const { error } = await supabase.from("now_skips").delete().neq("id", 0);
    if (error) throw error;
  }
}

export const storage = new SupabaseStorage();
