// src/mastra/workflows/whale-watch.ts
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { getRecentTransactionsTool } from "../agents/solana-onchain-assistant/helpers";

/* ─────────────────── STEP 1 ─────────────────── */
const fetchTxStep = createStep({
  id: "fetch-tx",
  description: "Fetch the latest transactions for a given wallet",
  inputSchema: z.object({
    wallet: z.string(),
    limit: z
      .number()
      .min(1)
      .max(100)
      .default(50),
    threshold: z
      .number()
      .min(0)
      .default(1_000),
  }),
  // Corrected outputSchema to match the returned object structure
  outputSchema: z.object({
    txs: z.array(
      z.object({
        signature: z.string(),
        timestamp: z.number().nullable().optional(),
        type: z.string(),
        amount: z.number(),
        programIds: z.array(z.string()),
        status: z.string(),
      })
    ),
    threshold: z // Ensure threshold is passed along to the next step
      .number()
      .min(0)
      .default(1_000),
  }),
  execute: async ({ inputData, runtimeContext }) => {
    const { wallet, limit, threshold } = inputData;
    const txs = await getRecentTransactionsTool.execute({ // getRecentTransactionsTool directly returns an array
      context: { address: wallet, limit },
      runtimeContext,
    });
    // Return an object that matches the outputSchema
    return { txs, threshold };
  },
});

/* ─────────────────── STEP 2 ─────────────────── */
const whaleFilterStep = createStep({
  id: "filter-whales",
  description: "Filter out only those transfers above the threshold",
  inputSchema: z.object({
    txs: z.array(
      z.object({
        signature: z.string(),
        timestamp: z.number().nullable().optional(),
        type: z.string(),
        amount: z.number(),
        programIds: z.array(z.string()),
        status: z.string(),
      })
    ),
    threshold: z
      .number()
      .min(0)
      .default(1_000), // SOL units
  }),
  outputSchema: z.object({
    bigMoves: z.array(
      z.object({
        signature: z.string(),
        timestamp: z.number().nullable().optional(),
        type: z.string(),
        amount: z.number(),
        programIds: z.array(z.string()),
        status: z.string(),
      })
    ),
  }),
  execute: async ({ inputData }) => {
    const { txs, threshold } = inputData;

    // explicitly type `t` so TS has no implicit‐any here
    const bigMoves = txs.filter((t: any) => t.amount >= threshold);

    return { bigMoves };
  },
});

/* ─────────────────── WORKFLOW ─────────────────── */
export const whaleWatchWorkflow = createWorkflow({
  id: "whale-watch",
  description: "Detect whale‐sized transfers in a wallet’s recent transactions",
  inputSchema: z.object({
    wallet: z.string(),
    limit: z
      .number()
      .min(1)
      .max(100)
      .default(50),
    threshold: z
      .number()
      .min(0)
      .default(1_000), // SOL units
  }),
  outputSchema: z.object({
    bigMoves: z.array(
      z.object({
        signature: z.string(),
        timestamp: z.number().nullable().optional(),
        type: z.string(),
        amount: z.number(),
        programIds: z.array(z.string()),
        status: z.string(),
      })
    ),
  }),
})
  .then(fetchTxStep)
  .then(whaleFilterStep)
  .commit();