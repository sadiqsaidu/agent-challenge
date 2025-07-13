// src/mastra/workflows/token-watchlist.ts
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { getTokenPriceDataTool } from "../agents/solana-onchain-assistant/helpers";

const priceFetchStep = createStep({
  id: "price-fetch",
  description: "Fetch current token prices and compare against targets",
  inputSchema: z.object({
    watch: z.record(z.string(), z.number()), // mint ➜ target price
  }),
  outputSchema: z.object({
    hits: z.record(z.string(), z.number()),  // mint ➜ current price (only if ≥ target)
  }),

  // use `execute`, and destructure your validated inputs from `inputData`
  execute: async ({ inputData, runtimeContext }) => { // Destructure runtimeContext here
    const { watch } = inputData;
    const hits: Record<string, number> = {};

    // Iterate each [mint, targetPrice]
    await Promise.all(
      Object.entries(watch).map(async ([mint, targetPrice]) => {
        // call the tool with the proper `{ context: … }` wrapper
        const { price } = await getTokenPriceDataTool.execute({
          context: { tokenId: mint },
          runtimeContext: runtimeContext, // Pass the destructured runtimeContext
        });

        // if current price meets or exceeds the target, record it
        if (price >= targetPrice) {
          hits[mint] = price;
        }
      })
    );

    return { hits };
  },
});

export const tokenWatchlistWorkflow = createWorkflow({
  id: "token-watchlist",
  description: "Return tokens whose price has met/exceeded a target",
  inputSchema: z.object({
    watch: z.record(z.string(), z.number()),
  }),
  outputSchema: z.object({
    hits: z.record(z.string(), z.number()),
  }),
})
  .then(priceFetchStep)
  .commit();