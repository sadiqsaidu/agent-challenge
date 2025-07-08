import dotenv from "dotenv";
import { google } from '@ai-sdk/google';
import { LanguageModelV1 } from "@ai-sdk/provider";

// Load environment variables from .env file at the root
dotenv.config();

// --- Flexible Model Configuration ---

// Use an environment variable to choose the AI provider.
// Defaults to 'google' for your development with Gemini.
const provider = process.env.AI_PROVIDER ?? "google";

let model: LanguageModelV1;
let modelName: string;

switch (provider.toLowerCase()) {
  case "google":
  default:
    // Configure for Google Gemini
    // Ensure GOOGLE_API_KEY is in your .env file
    modelName = 'models/gemini-1.5-flash-latest';
    model = google(modelName);
    console.log(`Using AI Provider: Google Gemini`);
    break;
}

// Export the dynamically created model instance.
// Your agent files will import this `model` and it will be Gemini.
export { model };

console.log(`Model details: \n  Provider: ${provider}\n  Model: ${modelName}`);