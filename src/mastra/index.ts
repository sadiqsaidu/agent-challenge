import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";

import { solanaAgent } from "./agents/solana-onchain-assistant";


export const mastra = new Mastra({
    agents: {
        solanaAgent,
    },

    workflows: {
    },

    logger: new PinoLogger({
        name: "Mastra",
        level: "info",
    }),
    server: {
        port: 8080,
        timeout: 10000,
    },
});