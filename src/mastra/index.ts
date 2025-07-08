import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";

// 1. Import your custom agent. The name is `solanaAgent` as exported from your agent's index file.
import { solanaAgent } from "./agents/solana-onchain-assistant";

// 2. The template code for weather-agent and your-agent has been removed for clarity.
//    This makes your submission cleaner and focuses on your work.

export const mastra = new Mastra({
    // 3. Register your agent with Mastra.
    //    The key 'solanaAgent' is how it will be identified in the playground and API.
    agents: {
        solanaAgent,
    },

    // 4. The workflows object can be removed if you are not submitting any.
    workflows: {
        // We've removed the weatherWorkflow as it's not part of your submission.
    },

    // 5. Keep the logger and server configurations as they are useful defaults.
    logger: new PinoLogger({
        name: "Mastra",
        level: "info",
    }),
    server: {
        port: 8080,
        timeout: 10000,
    },
});