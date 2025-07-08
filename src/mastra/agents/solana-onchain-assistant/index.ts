/**
 * Solana Onchain Assistant - MCP Server
 * 
 * This file implements a Model Context Protocol (MCP) server that provides various tools
 * for analyzing Solana blockchain data, including:
 * - Token price and sentiment analysis
 * - Wallet activity monitoring
 * - Portfolio analysis
 * - Crypto news aggregation
 * - Token risk analysis
 * 
 * The server uses the MCP SDK to expose these tools as API endpoints that can be called
 * by AI models or other applications.
 * 
 * @module src/index
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  isValidSolanaAddress,
  getTokenBalance,
  getTokenPriceData,
  getRecentTransactions,
  getAllNews,
  getOnChainTokenData,
  getTokenHoldersDistribution,
  analyzeTransactionPatterns,
  analyzeHolderConcentration,
  analyzeLiquidity
} from "./helpers.js";

/**
 * MCP Server Configuration
 * Creates a new MCP server instance with the specified name and version.
 * This server will handle all tool requests and manage the communication protocol.
 */
const server = new McpServer({
  name: "Solana Onchain Assistant",
  version: "1.0.0"
});

/**
 * Token Price and Sentiment Analysis Tool
 * 
 * Retrieves current price data and market metrics for a specified token.
 * Supports searching by token ID, symbol, or name.
 * 
 * @tool get-token-price
 * @param {string} tokenId - Token identifier (ID, symbol, or name)
 * @returns {Object} Token price data including current price, 24h/7d changes, and volume
 */
server.tool(
  "get-token-price",
  {
    tokenId: z.string()
      .describe("Request a token price (can be the token's ID like 'bitcoin', symbol like 'btc', or name like 'Bitcoin')")
  },
  async ({ tokenId }) => {
    try {
      const analysis = await getTokenPriceData(tokenId);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(analysis, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error analyzing token: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  }
);

/**
 * Wallet Activity Analysis Tool
 * 
 * Analyzes a Solana wallet's recent activity, including:
 * - Current SOL balance
 * - Transaction history
 * - Activity categorization (DeFi, NFT, Token transfers)
 * - Time-based filtering
 * 
 * @tool get-address-activity
 * @param {string} walletAddress - Solana wallet address to analyze
 * @param {string} timeRange - Analysis time range (24h, 7d, or 30d)
 * @returns {Object} Wallet activity analysis including balance, transaction counts, and recent activity
 */
server.tool(
  "get-address-activity",
  {
    walletAddress: z.string()
      .describe("Solana wallet address to check activity for (must be a valid base58 address)")
      .refine(isValidSolanaAddress, {
        message: "Invalid Solana wallet address format. Please provide a valid base58 address."
      }),
    timeRange: z.enum(["24h", "7d", "30d"]).default("7d").describe("Time range to check activity for (24h, 7d, or 30d)")
  },
  async ({ walletAddress, timeRange }) => {
    try {
      // Get wallet balance
      const balance = await getTokenBalance(walletAddress);
      
      // Get recent transactions
      const transactions = await getRecentTransactions(walletAddress, 20);
      
      // Calculate time-based filtering
      const now = Math.floor(Date.now() / 1000);
      const timeRanges = {
        "24h": now - 86400,
        "7d": now - 604800,
        "30d": now - 2592000
      };
      const startTime = timeRanges[timeRange];
      
      // Filter transactions by time range
      const filteredTransactions = transactions.filter(tx => 
        tx.timestamp && tx.timestamp >= startTime
      );
      
      // Analyze transaction types
      const analysis = {
        totalBalance: balance,
        transactionCount: filteredTransactions.length,
        transactionTypes: {
          defi: filteredTransactions.filter(tx => tx.type === "DeFi").length,
          nft: filteredTransactions.filter(tx => tx.type === "NFT").length,
          token: filteredTransactions.filter(tx => tx.type === "Token Transfer").length
        },
        recentActivity: filteredTransactions.slice(0, 5).map(tx => ({
          type: tx.type,
          amount: tx.amount,
          timestamp: new Date(tx.timestamp! * 1000).toISOString(),
          status: tx.status
        })),
        timeRange: timeRange
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(analysis, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error checking address activity: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  }
);


/**
 * Crypto News Aggregation Tool
 * 
 * Fetches and aggregates latest crypto and web3 news from multiple sources.
 * Features:
 * - Category-based filtering
 * - Mobile-friendly formatting
 * - Trending topics analysis
 * - Sentiment analysis
 * 
 * @tool get-latest-crypto-news
 * @param {string} category - News category (all, defi, nft, web3, trading)
 * @param {number} limit - Maximum number of articles to return (1-20)
 * @param {string} format - Response format (mobile or detailed)
 * @returns {Object|string} News articles in either detailed JSON or mobile-friendly format
 */
server.tool(
  "get-latest-crypto-news",
  {
    category: z.enum(['all', 'defi', 'nft', 'web3', 'trading']).default('all')
      .describe("Category of news to fetch (all, defi, nft, web3, or trading)"),
    limit: z.number().min(1).max(20).default(10)
      .describe("Maximum number of news articles to return (1-20)"),
    format: z.enum(['mobile', 'detailed']).default('mobile')
      .describe("Response format - 'mobile' for concise mobile-friendly format, 'detailed' for full JSON")
  },
  async ({ category, limit, format }) => {
    try {
      // Get all news
      const newsData = await getAllNews();
      
      // Filter by category if not 'all'
      let filteredArticles = newsData.articles;
      if (category !== 'all') {
        filteredArticles = newsData.articles.filter(article => 
          article.categories.some(cat => 
            cat.toLowerCase().includes(category.toLowerCase())
          )
        );
      }

      // Apply limit
      filteredArticles = filteredArticles.slice(0, limit);

      if (format === 'detailed') {
        // Return detailed JSON format
        const response = {
          summary: {
            totalResults: newsData.totalResults,
            category,
            trendingTopics: newsData.trendingTopics,
            lastUpdated: newsData.lastUpdated
          },
          articles: filteredArticles.map(article => ({
            title: article.title,
            summary: article.summary,
            source: article.source,
            url: article.url,
            publishedAt: new Date(article.publishedAt).toLocaleString(),
            sentiment: article.sentiment,
            categories: article.categories
          }))
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(response, null, 2)
          }]
        };
      } else {
        // Return mobile-friendly format
        const now = new Date();
        const lastUpdated = new Date(newsData.lastUpdated);
        const timeAgo = Math.floor((now.getTime() - lastUpdated.getTime()) / (1000 * 60)); // minutes ago

        // Format trending topics with emojis
        const trendingTopics = newsData.trendingTopics
          .map(topic => `#${topic}`)
          .join(' ');

        // Create mobile-friendly article list
        const articlesList = filteredArticles.map((article, index) => {
          const publishedDate = new Date(article.publishedAt);
          const hoursAgo = Math.floor((now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60));
          
          // Add sentiment emoji
          const sentimentEmoji = article.sentiment === 'positive' ? '📈' 
            : article.sentiment === 'negative' ? '📉' 
            : '➡️';

          // Add category emoji
          const categoryEmoji = article.categories.some(cat => cat.toLowerCase().includes('defi')) ? '🔄'
            : article.categories.some(cat => cat.toLowerCase().includes('nft')) ? '🖼️'
            : article.categories.some(cat => cat.toLowerCase().includes('web3')) ? '🌐'
            : '💱';

          return `${index + 1}. ${sentimentEmoji} ${categoryEmoji} ${article.title}
   ${article.summary.substring(0, 100)}...
   📰 ${article.source} • ${hoursAgo}h ago
   🔗 ${article.url}`;
        }).join('\n\n');

        // Create mobile-friendly response
        const mobileResponse = `📰 Latest Crypto News (${category.toUpperCase()})
⏰ Updated ${timeAgo}m ago

🔥 Trending: ${trendingTopics}

${articlesList}

📊 Found ${newsData.totalResults} articles • Showing top ${filteredArticles.length}`;

        return {
          content: [{
            type: "text",
            text: mobileResponse
          }]
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (format === 'mobile') {
        return {
          content: [{
            type: "text",
            text: `❌ Error fetching news:\n${errorMessage}\n\nPlease try again in a few moments.`
          }],
          isError: true
        };
      } else {
        return {
          content: [{
            type: "text",
            text: `Error fetching crypto news: ${errorMessage}`
          }],
          isError: true
        };
      }
    }
  }
);

/**
 * Token Risk Analysis Tool
 * 
 * Analyzes a token for potential risks and fraud indicators:
 * - Holder concentration analysis
 * - Transaction pattern analysis
 * - Liquidity analysis
 * - Contract risk assessment
 * 
 * @tool potential-rugpull-and-fraud-token-analysis
 * @param {string} tokenAddress - Solana token address to analyze
 * @returns {Object} Risk analysis including risk score, level, and detailed metrics
 */
server.tool(
  "potential-rugpull-and-fraud-token-analysis",
  {
    tokenAddress: z.string()
      .describe("Solana token address to analyze for fraud/rugpull risk")
      .refine(isValidSolanaAddress, {
        message: "Invalid token address format. Please provide a valid Solana address."
      })
  },
  async ({ tokenAddress }) => {
    try {
      // Verify token exists first with retry
      try {
        await getOnChainTokenData(tokenAddress);
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: Unable to fetch token data. This could be due to:
1. Invalid token address
2. Network connectivity issues
3. Token no longer exists
Please verify the token address and try again.`
          }],
          isError: true
        };
      }

      // Get all metrics with retry logic
      const holders = await getTokenHoldersDistribution(tokenAddress);
      const holderAnalysis = analyzeHolderConcentration(holders);
      const transactionAnalysis = await analyzeTransactionPatterns(tokenAddress);
      const liquidityAnalysis = await analyzeLiquidity(tokenAddress);

      // Calculate overall risk score (weighted average)
      const overallRiskScore = Math.round(
        (holderAnalysis.score * 0.4) + // 40% weight to holder concentration
        (transactionAnalysis.score * 0.3) + // 30% weight to transaction patterns
        (liquidityAnalysis.score * 0.3) // 30% weight to liquidity
      );

      // Combine all risk factors
      const allRiskFactors = [
        ...holderAnalysis.factors,
        ...transactionAnalysis.factors,
        ...liquidityAnalysis.factors
      ];

      // Add warning if we couldn't get all data
      if (holders.length === 0) {
        allRiskFactors.push("Warning: Could not fetch holder distribution data");
      }
      if (transactionAnalysis.score === 0) {
        allRiskFactors.push("Warning: Could not fetch transaction data");
      }

      const analysis = {
        liquidityScore: liquidityAnalysis.score,
        holderConcentrationScore: holderAnalysis.score,
        transactionPatternScore: transactionAnalysis.score,
        contractRiskScore: 100,
        overallRiskScore,
        riskFactors: allRiskFactors
      };

      // Generate risk assessment message
      let riskLevel = "LOW";
      if (overallRiskScore < 40) {
        riskLevel = "EXTREMELY HIGH";
      } else if (overallRiskScore < 60) {
        riskLevel = "HIGH";
      } else if (overallRiskScore < 80) {
        riskLevel = "MEDIUM";
      }

      const response = {
        riskScore: overallRiskScore,
        riskLevel,
        detailedMetrics: analysis,
        summary: `Token Risk Analysis (${overallRiskScore}% risk score - ${riskLevel} RISK):
        ${allRiskFactors.length > 0 ? '\nRisk Factors:\n- ' + allRiskFactors.join('\n- ') : 'No significant risk factors detected'}`
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(response, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error analyzing token risk: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again in a few moments.`
        }],
        isError: true
      };
    }
  }
);

/**
 * Server Initialization
 * Creates and starts the MCP server using stdio transport.
 * This enables communication between the server and client applications.
 */
const transport = new StdioServerTransport();
await server.connect(transport); 