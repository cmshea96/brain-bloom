import { z } from "zod";

// ── Blooms ─────────────────────────────────────────────────────────────────
// A Bloom is any half-formed thought, idea, project, or feeling.
export const insertBloomSchema = z.object({
  title: z.string().min(1),
  feeling: z.string().optional().default(""),
  color: z.string().default("#8b5cf6"),
  energyRequired: z.string().default("any"),
  isActive: z.boolean().default(true),
});
export type InsertBloom = z.infer<typeof insertBloomSchema>;

export interface Bloom {
  id: number;
  title: string;
  feeling: string | null;
  color: string;
  energyRequired: string;
  isActive: boolean;
  createdAt: string;
}

// ── Branches ───────────────────────────────────────────────────────────────
export const insertBranchSchema = z.object({
  bloomId: z.number(),
  text: z.string().min(1),
  type: z.string().default("subtask"),
  color: z.string().default("#8b5cf6"),
  isActionable: z.boolean().default(false),
  isDone: z.boolean().default(false),
  energyRequired: z.string().default("any"),
  posX: z.number().default(0),
  posY: z.number().default(0),
});
export type InsertBranch = z.infer<typeof insertBranchSchema>;

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

// ── Now Queue ──────────────────────────────────────────────────────────────
export interface NowSkip {
  id: number;
  branchId: number;
  skippedAt: string;
}
export type InsertNowSkip = { branchId: number };
