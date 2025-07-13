# Solana Onchain Assistant

A powerful AI agent for Solana blockchain analytics, risk assessment, and real-time insights. Built with the [Mastra](https://mastra.ai/) framework for the Nosana Builders Challenge.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Workflows](#workflows)
- [Example Use Cases](#example-use-cases)
- [Setup & Running Locally](#setup--running-locally)
- [Environment Variables](#environment-variables)
- [Extending the Agent](#extending-the-agent)
- [Docker & Deployment](#docker--deployment)
- [References](#references)
- [Support](#support)

---

## Overview

The **Solana Onchain Assistant** is an AI-powered agent that provides real-time analytics, risk assessment, and actionable insights for Solana blockchain assets, wallets, and tokens. The agent leverages on-chain data, market APIs, and news aggregation to help users make informed decisions in the crypto space.

---

## Features

- **SOL & SPL Token Balance Checks:** Instantly fetch wallet balances for SOL and major tokens.
- **Token Price & Market Data:** Get up-to-date prices, 24h/7d changes, and volume from CoinGecko.
- **Risk Analysis:** Automated risk scoring for tokens, including liquidity, holder concentration, contract risks, and transaction patterns.
- **Transaction Analysis:** Retrieve and filter recent transactions, including whale activity detection.
- **Crypto & Web3 News Aggregation:** Summarize the latest news and trending topics.
- **Composable Workflows:** Chain multiple tools for deep-dive portfolio or token analysis.
- **LLM-Powered Chat:** Natural language interface powered by a pluggable LLM (Google Gemini or Qwen).

---

## Architecture

```
+-------------------+
|   User/Frontend   |
+-------------------+
          |
          v
+-------------------+         +-------------------+
|   Mastra Agent    |<------->|   Mastra Tools    |
| (Solana Assistant)|         | (TypeScript fns)  |
+-------------------+         +-------------------+
          |                           |
          v                           v
+-------------------+         +-------------------+
|   LLM Provider    |         |  External APIs    |
| (Gemini/Qwen/OAI) |         | (Solana, Coingecko|
+-------------------+         |  CryptoCompare,   |
                              |  NewsAPI, etc.)   |
                              +-------------------+
```

- **Agent Layer:** Handles user queries, tool selection, and response formatting.
- **Tools Layer:** TypeScript functions for blockchain, market, and news data.
- **Workflows:** Multi-step processes combining tools for complex tasks.
- **LLM Provider:** Pluggable backend (Google Gemini, Qwen, or OpenAI-compatible).
- **External APIs:** Solana RPC, CoinGecko, CryptoCompare, NewsAPI, etc.

---

## How It Works

1. **User Query:** The user asks a question (e.g., "What is the risk of this token?").
2. **Agent Reasoning:** The agent uses LLM reasoning to select the most relevant tool(s).
3. **Tool Execution:** The agent calls the appropriate TypeScript function(s) to fetch real data.
4. **Workflow Chaining:** For complex queries, the agent chains multiple tools (e.g., fetch on-chain data → analyze risk → get price).
5. **Response Formatting:** The agent formats the answer clearly, with tables, bullet points, or summaries.
6. **Result Delivery:** The user receives a concise, actionable response.

---

## Workflows

### 1. Portfolio Health Check

- **Input:** Wallet address
- **Steps:**
  1. Fetch SOL balance
  2. Fetch SPL token balances (USDC, USDT, WBTC)
  3. Fetch token prices
  4. Run risk analysis on each token
- **Output:** Portfolio summary with balances, prices, and risk scores

### 2. Token Insight

- **Input:** Token mint address
- **Steps:**
  1. Fetch on-chain token data (supply, authorities)
  2. Analyze token risk (liquidity, holders, contract, transactions)
  3. Fetch current price data
- **Output:** Deep-dive report on token health and risk

### 3. Whale Watch

- **Input:** Wallet address, transaction limit, threshold
- **Steps:**
  1. Fetch recent transactions
  2. Filter for large ("whale") transfers above threshold
- **Output:** List of significant transfers

### 4. Token Watchlist

- **Input:** Map of token mints to target prices
- **Steps:**
  1. Fetch current prices for each token
  2. Return tokens that have met/exceeded target price
- **Output:** List of tokens hitting price targets

---

## Example Use Cases

### 1. Check Wallet Portfolio Health

> "How healthy is my portfolio at `9xQeWvG816bUx...`?"

- Returns SOL and major token balances, current prices, and risk analysis for each asset.

### 2. Analyze Token Risk

> "Is the token `EPjFWdd5AufqSSqeM2q9Dhp8wJKt5Nq1i4gXv1gbPv36` risky?"

- Returns a risk score, key risk factors (e.g., high holder concentration, active mint authority), and a summary.

### 3. Detect Whale Activity

> "Show me all transfers above 10,000 SOL for wallet `...` in the last 50 transactions."

- Returns a list of large transactions, with details.

### 4. Track Token Price Targets

> "Alert me when USDC or WBTC reach $1.10 or $70,000."

- Returns tokens that have met or exceeded the specified price targets.

### 5. Get Latest Crypto News

> "What's trending in crypto and web3 right now?"

- Returns a summary of the latest news articles and trending topics.

---

## Setup & Running Locally

1. **Clone the repository:**
   ```sh
   git clone <your-fork-url>
   cd agent-challenge
   ```

2. **Install dependencies:**
   ```sh
   pnpm install
   ```

3. **Configure environment variables:**
   - Copy `.env.example` to `.env` and fill in required API keys (see [Environment Variables](#environment-variables)).

4. **Run the development server:**
   ```sh
   pnpm run dev
   ```
   - Visit [http://localhost:8080](http://localhost:8080) to interact with the agent.

---

## Environment Variables

You must provide API keys for Solana, CoinGecko, CryptoCompare, and NewsAPI. Example `.env`:

```env
# LLM Provider (choose one)
AI_PROVIDER=google
GOOGLE_GENERATIVE_AI_API_KEY=your_google_gemini_api_key

# Or for Qwen/Ollama
# AI_PROVIDER=qwen
# API_BASE_URL=http://localhost:11434/v1
# QWEN_API_KEY=dummy
# MODEL_NAME_AT_ENDPOINT=qwen2.5:1.5b

# Solana RPC
ALCHEMY_API_KEY=your_alchemy_api_key

# News APIs
CRYPTOCOMPARE_API_KEY=your_cryptocompare_api_key
NEWS_API_KEY=your_newsapi_key
```

---

## Extending the Agent

- **Add New Tools:** Create new TypeScript functions in `src/mastra/agents/solana-onchain-assistant/helpers.ts` and wrap them with `createTool`.
- **Add New Workflows:** Compose multi-step workflows in `src/mastra/workflows/`.
- **Change LLM Provider:** Edit `src/mastra/config.ts` and update `.env` as needed.
- **Customize Instructions:** Edit the `instructions` string in `src/mastra/agents/solana-onchain-assistant/index.ts`.

---

## Docker & Deployment

*Docker setup and deployment instructions will be added soon.*

---

## References

- [Mastra Documentation](https://mastra.ai/docs)
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/)
- [CoinGecko API](https://www.coingecko.com/en/api)
- [CryptoCompare API](https://min-api.cryptocompare.com/)
- [NewsAPI](https://newsapi.org/)

---

## Support

- For technical help, join the [Nosana Discord](https://nosana.com/discord).
- For Mastra framework questions, see [Mastra Docs](https://mastra.ai/docs).

---
