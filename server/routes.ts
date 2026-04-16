import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertBloomSchema, insertBranchSchema } from "@shared/schema";

export async function registerRoutes(httpServer: Server, app: Express) {
  // ── Blooms ──────────────────────────────────────────────────────────────
  app.get("/api/blooms", async (_req, res) => {
    try {
      res.json(await storage.getBlooms());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/blooms/:id", async (req, res) => {
    try {
      const bloom = await storage.getBloom(parseInt(req.params.id));
      if (!bloom) return res.status(404).json({ error: "Not found" });
      res.json(bloom);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/blooms", async (req, res) => {
    const parsed = insertBloomSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    try {
      res.status(201).json(await storage.createBloom(parsed.data));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/blooms/:id", async (req, res) => {
    try {
      const bloom = await storage.updateBloom(parseInt(req.params.id), req.body);
      if (!bloom) return res.status(404).json({ error: "Not found" });
      res.json(bloom);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/blooms/:id", async (req, res) => {
    try {
      await storage.deleteBloom(parseInt(req.params.id));
      res.status(204).send();
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Branches ─────────────────────────────────────────────────────────────
  app.get("/api/blooms/:id/branches", async (req, res) => {
    try {
      res.json(await storage.getBranches(parseInt(req.params.id)));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/branches", async (req, res) => {
    const parsed = insertBranchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    try {
      res.status(201).json(await storage.createBranch(parsed.data));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/branches/:id", async (req, res) => {
    try {
      const branch = await storage.updateBranch(parseInt(req.params.id), req.body);
      if (!branch) return res.status(404).json({ error: "Not found" });
      res.json(branch);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/branches/:id", async (req, res) => {
    try {
      await storage.deleteBranch(parseInt(req.params.id));
      res.status(204).send();
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Now View ──────────────────────────────────────────────────────────────
  app.get("/api/now", async (req, res) => {
    try {
      const energy = (req.query.energy as string) || "any";
      const skips = (await storage.getNowSkips()).map(s => s.branchId);
      const actionable = await storage.getActionableBranches(energy);
      const available = actionable.filter(b => !skips.includes(b.id));
      res.json({ available, skipped: skips.length, total: actionable.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/now/skip/:branchId", async (req, res) => {
    try {
      const skip = await storage.skipBranch(parseInt(req.params.branchId));
      res.status(201).json(skip);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/now/reset", async (_req, res) => {
    try {
      await storage.clearSkips();
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
