import { createTool } from "@mastra/core/tools";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { google } from '@ai-sdk/google'; // Import Google for Gemini
import {
    isValidSolanaAddress,
    getTokenHoldersDistribution,
    analyzeHolderConcentration,
    analyzeTransactionPatterns,
    analyzeLiquidity,
    getOnChainTokenData
} from "./helpers"; // Import from the local helper file

// --- 1. DEFINE THE TOOL ---
// This tool encapsulates the risk analysis logic from your helpers.

const riskAnalysisSchema = z.object({
    riskScore: z.number().describe("Overall risk score from 0 (high risk) to 100 (low risk)."),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "EXTREMELY HIGH"]),
    summary: z.string().describe("A human-readable summary of the risk analysis."),
    detailedMetrics: z.object({
        liquidityScore: z.number(),
        holderConcentrationScore: z.number(),
        transactionPatternScore: z.number(),
    }),
    riskFactors: z.array(z.string()).describe("A list of specific red flags or warnings detected.")
});

export const analyzeTokenRiskTool = createTool({
    id: "analyze-solana-token-risk",
    description: "Analyzes a Solana token for potential risks, rug-pull indicators, and fraud. Use this to assess the safety of a token given its mint address.",
    inputSchema: z.object({
        tokenAddress: z.string()
            .describe("The Solana token mint address to analyze.")
            .refine(isValidSolanaAddress, {
                message: "Invalid token address format. Please provide a valid Solana address."
            })
    }),
    outputSchema: riskAnalysisSchema,
    execute: async ({ context }) => {
        const { tokenAddress } = context;

        // Verify the token exists.
        try {
            await getOnChainTokenData(tokenAddress);
        } catch (error) {
            throw new Error(`Token not found or data is inaccessible for address: ${tokenAddress}. Please verify the address.`);
        }

        const [holders, transactionAnalysis, liquidityAnalysis] = await Promise.all([
            getTokenHoldersDistribution(tokenAddress),
            analyzeTransactionPatterns(tokenAddress),
            analyzeLiquidity(tokenAddress),
        ]);

        const holderAnalysis = analyzeHolderConcentration(holders);

        const overallRiskScore = Math.round(
            (holderAnalysis.score * 0.4) +
            (transactionAnalysis.score * 0.3) +
            (liquidityAnalysis.score * 0.3)
        );

        const allRiskFactors = [
            ...holderAnalysis.factors,
            ...transactionAnalysis.factors,
            ...liquidityAnalysis.factors
        ];

        let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "EXTREMELY HIGH" = "LOW";
        if (overallRiskScore < 40) riskLevel = "EXTREMELY HIGH";
        else if (overallRiskScore < 60) riskLevel = "HIGH";
        else if (overallRiskScore < 80) riskLevel = "MEDIUM";

        const summary = `Token Risk Analysis for ${tokenAddress}:\nThe overall risk score is ${overallRiskScore}/100, which is considered ${riskLevel} RISK. ${allRiskFactors.length > 0 ? 'Key risk factors include: ' + allRiskFactors.join(', ') : 'No significant risk factors were detected.'}`;
        
        return {
            riskScore: overallRiskScore,
            riskLevel,
            summary,
            detailedMetrics: {
                liquidityScore: liquidityAnalysis.score,
                holderConcentrationScore: holderAnalysis.score,
                transactionPatternScore: transactionAnalysis.score,
            },
            riskFactors: allRiskFactors
        };
    },
});


// --- 2. DEFINE THE AGENT ---
// This agent is given the tool we just created.

const instructions = `
    You are a sophisticated Solana Onchain Assistant, an expert in cryptocurrency and blockchain analysis.
    Your primary purpose is to help users make informed decisions by providing clear, accurate, and actionable on-chain data analysis.
    When a user asks you to analyze a token for risk:
    1. You MUST use the "analyze-solana-token-risk" tool to get the data. Do not invent information.
    2. When presenting the analysis, state the final risk level and score clearly.
    3. Crucially, explain the *reasons* for the score by summarizing the risk factors found by the tool.
    4. If the tool fails or an address is invalid, inform the user clearly and politely.
    5. Be concise but comprehensive. Start with the main conclusion, then provide the details.
`;

export const solanaAgent = new Agent({
  name: "Solana Onchain Assistant",
  instructions,
  // Use Google's Gemini model as requested
  model: google('models/gemini-1.5-flash-latest'),
  tools: {
    // Make the tool available to the agent
    analyzeTokenRiskTool,
  },
});