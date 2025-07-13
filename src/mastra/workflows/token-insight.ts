// src/mastra/workflows/token-insight.ts
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import {
  getOnChainTokenDataTool,
  analyzeTokenRiskTool,
  getTokenPriceDataTool,
} from "../agents/solana-onchain-assistant/helpers";

/* ─────────────────── STEP 1 ─────────────────── */
const fetchOnChainStep = createStep({
  id: "fetch-onchain",
  description: "Fetch recent on-chain data for the token",
  inputSchema: z.object({ mint: z.string() }),
  outputSchema: z.object({ onChain: z.any() }),
  // 👇 Destructure runtimeContext
  execute: async ({ inputData, runtimeContext }) => {
    const { mint } = inputData;
    const onChain = await getOnChainTokenDataTool.execute({
      context: { tokenAddress: mint }, // ✅ FIX: Changed 'address' to 'tokenAddress'
      runtimeContext,                 // ✅ FIX: Pass runtimeContext
    });
    return { onChain };
  },
});

/* ─────────────────── STEP 2 ─────────────────── */
const riskStep = createStep({
  id: "risk-analysis",
  description: "Analyze on-chain risk for the token",
  // ✅ FIX: Add 'onChain' from the previous step's output to the input schema
  inputSchema: z.object({ mint: z.string(), onChain: z.any() }),
  outputSchema: z.object({ risk: z.any() }),
  // 👇 Destructure runtimeContext
  execute: async ({ inputData, runtimeContext }) => {
    const { mint } = inputData;
    const risk = await analyzeTokenRiskTool.execute({
      context: { tokenAddress: mint },
      runtimeContext, // ✅ FIX: Pass runtimeContext
    });
    return { risk };
  },
});

/* ─────────────────── STEP 3 ─────────────────── */
const priceStep = createStep({
  id: "fetch-price",
  description: "Fetch current price data for the token",
  // ✅ FIX: Add 'onChain' and 'risk' from previous steps to the input schema
  inputSchema: z.object({ mint: z.string(), onChain: z.any(), risk: z.any() }),
  outputSchema: z.object({ price: z.any() }),
  // 👇 Destructure runtimeContext
  execute: async ({ inputData, runtimeContext }) => {
    const { mint } = inputData;
    const price = await getTokenPriceDataTool.execute({
      context: { tokenId: mint },
      runtimeContext, // ✅ FIX: Pass runtimeContext
    });
    return { price };
  },
});

/* ────────────────── COMPOSE WORKFLOW ─────────────────── */
export const tokenInsightWorkflow = createWorkflow({
  id: "token-insight",
  description: "Full token deep-dive (on-chain, risk, price)",
  inputSchema: z.object({ mint: z.string() }),
  outputSchema: z.object({
    onChain: z.any(),
    risk:    z.any(),
    price:   z.any(),
  }),
})
  .then(fetchOnChainStep)
  .then(riskStep)
  .then(priceStep)
  .commit();