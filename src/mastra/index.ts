import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { LibSQLStore } from "@mastra/libsql";

import { solanaAgent } from "./agents/solana-onchain-assistant";

// ─── Workflows ────────────────────────────────────────────────────
import { tokenInsightWorkflow }  from "./workflows/token-insight";
import { portfolioHealthWorkflow } from "./workflows/portfolio-health";
import { whaleWatchWorkflow }      from "./workflows/whale-watch";
import { tokenWatchlistWorkflow }  from "./workflows/token-watchlist";

export const mastra = new Mastra({
  /* ───── Agents ───── */
  agents: { solanaAgent },

  /* ───── Workflows ── */
  workflows: {
    tokenInsightWorkflow,
    portfolioHealthWorkflow,
    whaleWatchWorkflow,
    tokenWatchlistWorkflow,
  },

  /* ───── Shared store for memory, telemetry, workflows … ───── */
  storage: new LibSQLStore({ url: ":memory:" }),

  /* ───── Logger ───── */
  logger: new PinoLogger({ name: "Mastra", level: "info" }),

  /* ───── Built-in dev server ───── */
  server: {
    port: 8080,
    timeout: 10_000,
  },
});
