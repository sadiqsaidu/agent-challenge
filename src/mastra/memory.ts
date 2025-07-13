// src/mastra/memory.ts
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";

export const memory = new Memory({
  storage: new LibSQLStore({
    // file-based is fine for dev; switch to a real db in prod
    url: "file:../mastra.db",
  }),
  options: {
    lastMessages: 10,          // recent chat context
    threads: {
      generateTitle: true,     // auto-titles in the playground / UI
    },
    // workingMemoryScope defaults to "thread".  Uncomment the next
    // line if you want user-wide, cross-thread memory instead:
    // workingMemoryScope: "resource",
  },
});
