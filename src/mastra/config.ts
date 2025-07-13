// src/mastra/config.ts
import dotenv from "dotenv";
import { google, createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV1 } from "@ai-sdk/provider";

dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
}

const provider = (process.env.AI_PROVIDER ?? "google").toLowerCase();
let model: LanguageModelV1;

switch (provider) {
  case "google": {
    const apiKey = required("GOOGLE_GENERATIVE_AI_API_KEY");
    const googleProvider = createGoogleGenerativeAI({ apiKey });
    const modelName = "models/gemini-2.5-flash-lite-preview-06-17";
    model = googleProvider(modelName);
    console.log(`🔮 Using Google Gemini (${modelName})`);
    break;
  }

  case "qwen": {
    const baseURL = required("API_BASE_URL");          // https://…/v1
    const apiKey = required("QWEN_API_KEY");           // dummy is fine
    const modelName = required("MODEL_NAME_AT_ENDPOINT");

    const openAIProvider = createOpenAI({
      baseURL,
      apiKey,
      compatibility: "compatible",
    });

    model = openAIProvider(modelName);
    console.log(`🤖 Using Qwen (${modelName}) @ ${baseURL}`);
    break;
  }

  default:
    throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
}

export { model };
