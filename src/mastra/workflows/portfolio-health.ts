import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import {
  getSolBalanceTool,
  getTokenBalanceTool,
  getTokenPriceDataTool,
  analyzeTokenRiskTool,
} from "../agents/solana-onchain-assistant/helpers";

/* ───────────────────────────── STEP 1 ───────────────────────────── */
const solBalanceStep = createStep({
  id: "sol-balance",
  description: "Fetch the wallet’s SOL balance",
  inputSchema: z.object({ wallet: z.string() }),
  outputSchema: z.object({ sol: z.number().nullable() }),
  execute: async ({ inputData, runtimeContext }) => { // 👈 Destructure runtimeContext
    const { wallet } = inputData;

    const { balance } = await getSolBalanceTool.execute({
      context: { walletAddress: wallet },
      runtimeContext, // 👈 Pass runtimeContext
    });

    return { sol: balance };
  },
});

/* ───────────────────────────── STEP 2 ───────────────────────────── */
const tokenBalancesStep = createStep({
  id: "token-balances",
  description: "Fetch raw SPL-token balances",
  inputSchema: z.object({
    wallet: z.string(),
    sol: z.number().nullable(),
  }),
  outputSchema: z.object({
    tokens: z.record(z.string(), z.number()),
  }),
  execute: async ({ inputData, runtimeContext }) => { // 👈 Destructure runtimeContext
    const { wallet } = inputData;

    const mints = [
      "EPjFWdd5AufqSSqeM2q9Dhp8wJKt5Nq1i4gXv1gbPv36", // USDC
      "Es9vMFrzaCERj3WzFkpKZvSA5CMGTaFQQAF1fbvoVCe6", // USDT
      "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E", // WBTC
    ];

    const entries = await Promise.all(
      mints.map(async (mint) => {
        const { balance } = await getTokenBalanceTool.execute({
          context: { walletAddress: wallet, tokenMint: mint },
          runtimeContext, // 👈 Pass runtimeContext
        });
        return [mint, balance];
      }),
    );

    return { tokens: Object.fromEntries(entries) };
  },
});

/* ───────────────────────────── STEP 3 ───────────────────────────── */
const priceLookupStep = createStep({
  id: "price-lookup",
  description: "Look up USD prices for each token",
  inputSchema: z.object({
    wallet: z.string(),
    sol: z.number().nullable(),
    tokens: z.record(z.string(), z.number()),
  }),
  outputSchema: z.object({
    prices: z.record(z.string(), z.number()),
  }),
  execute: async ({ inputData, runtimeContext }) => { // 👈 Destructure runtimeContext
    const { tokens } = inputData;

    const entries = await Promise.all(
      Object.keys(tokens).map(async (mint) => {
        const { price } = await getTokenPriceDataTool.execute({
          context: { tokenId: mint },
          runtimeContext, // 👈 Pass runtimeContext
        });
        return [mint, price];
      }),
    );

    return { prices: Object.fromEntries(entries) };
  },
});

/* ───────────────────────────── STEP 4 ───────────────────────────── */
const riskStep = createStep({
  id: "risk-analysis",
  description: "Run on-chain & market-data risk checks",
  inputSchema: z.object({
    wallet: z.string(),
    sol: z.number().nullable(),
    tokens: z.record(z.string(), z.number()),
    prices: z.record(z.string(), z.number()),
  }),
  outputSchema: z.object({
    risk: z.record(z.string(), z.any()),
  }),
  execute: async ({ inputData, runtimeContext }) => { // 👈 Destructure runtimeContext
    const { tokens } = inputData;

    const entries = await Promise.all(
      Object.keys(tokens).map(async (mint) => {
        const risk = await analyzeTokenRiskTool.execute({
          context: { tokenAddress: mint },
          runtimeContext, // 👈 Pass runtimeContext
        });
        return [mint, risk];
      }),
    );

    return { risk: Object.fromEntries(entries) };
  },
});

/* ─────────────────────────── WORKFLOW ─────────────────────────── */
export const portfolioHealthWorkflow = createWorkflow({
  id: "portfolio-health",
  description: "Full SOL + SPL portfolio health check",
  inputSchema: z.object({ wallet: z.string() }),
  outputSchema: z.object({
    sol: z.number().nullable(),
    tokens: z.record(z.string(), z.number()),
    prices: z.record(z.string(), z.number()),
    risk: z.record(z.string(), z.any()),
  }),
})
  .then(solBalanceStep)
  .then(tokenBalancesStep)
  .then(priceLookupStep)
  .then(riskStep)
  .commit();