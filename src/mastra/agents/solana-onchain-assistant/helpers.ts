/**
 * Solana Onchain Assistant - Helper Functions
 * * This file contains all the helper functions and interfaces used by the Solana Onchain Assistant.
 * It provides core functionality for:
 * - Blockchain interaction (connection, address validation)
 * - Token operations (balance checking, price fetching)
 * - Transaction analysis
 * - News aggregation
 * - Risk analysis
 * * * @module src/helpers
 */

// 1️⃣ Polyfill fetch *before* importing @solana/web3.js
import fetch from "node-fetch";
if (!globalThis.fetch) {
  // @ts-ignore
  globalThis.fetch = fetch;
}

import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import dotenv from "dotenv";
import { z } from "zod";
import { createTool } from "@mastra/core/tools";

// Load environment variables
dotenv.config();

// --- Solana Connection ---
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
if (!ALCHEMY_API_KEY) {
  throw new Error("ALCHEMY_API_KEY not found in environment variables.");
}
export const connection = new Connection(
  `https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  "confirmed"
);

// Interfaces
export interface CoinGeckoToken {
  id: string;
  symbol: string;
  name: string;
}

export interface CoinGeckoApiResponse {
  [key: string]: {
    usd: number;
    usd_24h_change: number;
    usd_24h_vol: number;
    usd_7d_change: number;
  };
}

export interface TokenBalance {
  mint: string;
  amount: number;
  decimals: number;
  symbol?: string;
  name?: string;
  price?: number;
  value?: number;
  priceChange24h?: number;
  priceChange7d?: number;
}

export interface PortfolioAnalysis {
  totalValue: number;
  tokenCount: number;
  tokenDistribution: {
    symbol: string;
    value: number;
    percentage: number;
  }[];
  topPerformers: {
    symbol: string;
    priceChange24h: number;
    priceChange7d: number;
  }[];
  worstPerformers: {
    symbol: string;
    priceChange24h: number;
    priceChange7d: number;
  }[];
  insights: string[];
  lastUpdated: string;
}

export interface NewsArticle {
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  categories: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  relevanceScore?: number;
}

export interface NewsResponse {
  articles: NewsArticle[];
  totalResults: number;
  lastUpdated: string;
  trendingTopics: string[];
}

export interface OnChainTokenData {
  supply: number;
  decimals: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
}

export interface TokenRiskMetrics {
  liquidityScore: number;
  holderConcentrationScore: number;
  transactionPatternScore: number;
  contractRiskScore: number;
  overallRiskScore: number;
  riskFactors: string[];
}

export interface TokenHolder {
  address: string;
  balance: number;
  percentage: number;
}

// Cache variables
let tokenListCache: CoinGeckoToken[] | null = null;
let lastCacheUpdate = 0;
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

let newsCache: {
  data: NewsResponse;
  timestamp: number;
} | null = null;
const NEWS_CACHE_DURATION = 300000; // 5 minutes in milliseconds

// --- Helper Functions (exported) ---
/**
 * Validates if a string is a valid Solana wallet address
 * * @param {string} address - The address to validate
 * @returns {boolean} True if the address is valid, false otherwise
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Fetch the SOL balance for a wallet, with retries and proper error signaling.
 * @param walletAddress - Base58-encoded Solana public key
 * @returns Number of SOL (could be fractional), or null if the fetch ultimately fails.
 */
export async function getSolBalance(
  walletAddress: string
): Promise<number | null> {
  // 2️⃣ Validate format upfront
  if (!isValidSolanaAddress(walletAddress)) {
    throw new Error("Invalid Solana wallet address format");
  }

  const pubKey = new PublicKey(walletAddress);

  try {
    // 3️⃣ Retry the RPC call up to 3× with 1 s backoff
    const lamports = await withRetry(
      () => connection.getBalance(pubKey),
      /* maxRetries */ 3,
      /* delayMs    */ 1000
    );

    // 4️⃣ Convert lamports to SOL
    return lamports / LAMPORTS_PER_SOL;
  } catch (error) {
    // Surface the error in logs, but don't pretend the user has 0 SOL
    console.error("Error fetching SOL balance:", error);
    return null;
  }
}

/**
 * Retrieves the balance of a specific SPL token for a wallet
 * * @param {string} walletAddress - The wallet address to check
 * @param {string} tokenMint - The token's mint address
 * @returns {Promise<{balance: number, decimals: number}>} Token balance and decimals
 * @throws {Error} If the token balance cannot be fetched
 */
export async function getTokenBalance(walletAddress: string, tokenMint: string): Promise<{ balance: number, decimals: number }> {
  try {
    if (!isValidSolanaAddress(walletAddress)) {
      throw new Error("Invalid Solana wallet address format");
    }
    if (!isValidSolanaAddress(tokenMint)) {
      throw new Error("Invalid token mint address format");
    }
    const owner = new PublicKey(walletAddress);
    const mint = new PublicKey(tokenMint);

    // Find all token accounts for this wallet and mint
    const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint });
    if (!accounts.value.length) {
      return { balance: 0, decimals: 0 };
    }
    const accountInfo = accounts.value[0].account.data.parsed.info;
    return {
      balance: Number(accountInfo.tokenAmount.amount) / Math.pow(10, accountInfo.tokenAmount.decimals),
      decimals: accountInfo.tokenAmount.decimals
    };
  } catch (error) {
    console.error("Error fetching SPL token balance:", error);
    return { balance: 0, decimals: 0 };
  }
}

export async function getTokenList(): Promise<CoinGeckoToken[]> {
  const now = Date.now();
  
  if (tokenListCache && (now - lastCacheUpdate) < CACHE_DURATION) {
    return tokenListCache;
  }

  try {
    const response = await fetch('https://api.coingecko.com/api/v3/coins/list', {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    tokenListCache = await response.json() as CoinGeckoToken[];
    lastCacheUpdate = now;
    return tokenListCache;
  } catch (error) {
    throw new Error(`Failed to fetch token list: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function findToken(searchTerm: string): Promise<CoinGeckoToken | null> {
  const tokens = await getTokenList();
  const normalizedSearch = searchTerm.toLowerCase();
  
  const exactMatch = tokens.find(token => token.id === normalizedSearch);
  if (exactMatch) return exactMatch;
  
  const symbolMatch = tokens.find(token => token.symbol.toLowerCase() === normalizedSearch);
  if (symbolMatch) return symbolMatch;
  
  const nameMatch = tokens.find(token => token.name.toLowerCase() === normalizedSearch);
  return nameMatch || null;
}

/**
 * Fetches price data for a token from CoinGecko
 * * @param {string} tokenId - The token's CoinGecko ID
 * @returns {Promise<TokenPriceData>} Token price data including current price and changes
 * @throws {Error} If price data cannot be fetched
 */
export async function getTokenPriceData(tokenId: string) {
  try {
    const token = await findToken(tokenId);
    if (!token) {
      throw new Error(`Token "${tokenId}" not found. Try using the token's ID (e.g., "bitcoin"), symbol (e.g., "btc"), or name (e.g., "Bitcoin").`);
    }

    const apiUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${token.id}&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true&include_7d_change=true`;
    console.log("Fetching price data from:", apiUrl);
    
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json() as CoinGeckoApiResponse;
    
    if (!data[token.id]) {
      throw new Error("Token price data not found");
    }

    const priceData = data[token.id];
    
    return {
      name: token.name,
      symbol: token.symbol.toUpperCase(),
      price: priceData.usd,
      priceChange24h: priceData.usd_24h_change,
      priceChange7d: priceData.usd_7d_change,
      volume24h: priceData.usd_24h_vol,
      lastUpdated: new Date().toISOString(),
      tokenId: token.id
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Error fetching token data: ${error.message}`);
    }
    throw new Error('Unknown error occurred while fetching token data');
  }
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === maxRetries) break;
      
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      console.log(`Retry attempt ${attempt} of ${maxRetries}...`);
    }
  }
  
  throw lastError;
}

/**
 * Retrieves recent transactions for a wallet
 * * @param {string} walletAddress - The wallet address to analyze
 * @param {string} timeRange - The time range to analyze (24h, 7d, 30d)
 * @returns {Promise<Transaction[]>} Array of recent transactions
 * @throws {Error} If transactions cannot be fetched
 */
export async function getRecentTransactions(walletAddress: string, limit: number = 10): Promise<Transaction[]> {
  try {
    if (!isValidSolanaAddress(walletAddress)) {
      throw new Error("Invalid Solana wallet address format");
    }
    const pubKey = new PublicKey(walletAddress);
    
    const signatures = await withRetry(async () => 
      connection.getSignaturesForAddress(pubKey, { limit })
    );
    
    const transactions = await Promise.all(
      signatures.map(async (sig) => {
        const tx = await withRetry(async () => 
          connection.getTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed"
          })
        );

        if (!tx) {
          return {
            signature: sig.signature,
            timestamp: sig.blockTime,
            type: "Unknown",
            amount: 0,
            programIds: [],
            status: "Failed"
          };
        }

        const programIds = tx.transaction.message.staticAccountKeys
          .filter((key: PublicKey) => !key.equals(pubKey))
          .map((key: PublicKey) => key.toString());

        let txType = "Unknown";
        if (tx.meta?.logMessages) {
          const logs = tx.meta.logMessages.join(" ").toLowerCase();
          if (logs.includes("swap") || logs.includes("liquidity")) {
            txType = "DeFi";
          } else if (logs.includes("nft") || logs.includes("mint")) {
            txType = "NFT";
          } else if (logs.includes("token") || logs.includes("transfer")) {
            txType = "Token Transfer";
          }
        }

        return {
          signature: sig.signature,
          timestamp: sig.blockTime,
          type: txType,
          amount: tx.meta?.postBalances?.[0] ? 
            (tx.meta.postBalances[0] - tx.meta.preBalances[0]) / LAMPORTS_PER_SOL : 0,
          programIds,
          status: tx.meta?.err ? "Failed" : "Success"
        };
      })
    );
    return transactions;
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return [];
  }
}

export interface Transaction {
  signature: string;
  timestamp: number | null | undefined;
  type: string;
  amount: number;
  programIds: string[];
  status: string;
}

/**
 * Fetches and aggregates crypto news from multiple sources
 * * @returns {Promise<NewsResponse>} Aggregated news articles with trending topics
 * @throws {Error} If news cannot be fetched from any source
 */
export async function getAllNews(): Promise<NewsResponse> {
  const now = Date.now();
  
  if (newsCache && (now - newsCache.timestamp) < NEWS_CACHE_DURATION) {
    return newsCache.data;
  }

  try {
    const [cryptoNews, web3News] = await Promise.all([
      fetchCryptoNews(),
      fetchWeb3News()
    ]);

    const allArticles = [...cryptoNews, ...web3News]
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    const uniqueArticles = allArticles.filter((article, index, self) =>
      index === self.findIndex(a => 
        a.title.toLowerCase() === article.title.toLowerCase() ||
        a.url === article.url
      )
    );

    const trendingTopics = analyzeTrendingTopics(uniqueArticles);

    const response: NewsResponse = {
      articles: uniqueArticles,
      totalResults: uniqueArticles.length,
      lastUpdated: new Date().toISOString(),
      trendingTopics
    };

    newsCache = {
      data: response,
      timestamp: now
    };

    return response;
  } catch (error) {
    console.error("Error fetching news:", error);
    throw error;
  }
}

/**
 * Fetches crypto news from CryptoCompare API
 * * @returns {Promise<NewsArticle[]>} Array of crypto news articles
 * @throws {Error} If news cannot be fetched
 */
async function fetchCryptoNews(): Promise<NewsArticle[]> {
  try {
    const CRYPTOCOMPARE_API_KEY = process.env.CRYPTOCOMPARE_API_KEY;
    if (!CRYPTOCOMPARE_API_KEY) {
      throw new Error("CRYPTOCOMPARE_API_KEY not found in environment variables");
    }

    const response = await fetch(
      'https://min-api.cryptocompare.com/data/v2/news/?lang=EN',
      {
        headers: {
          'authorization': `Apikey ${CRYPTOCOMPARE_API_KEY}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`CryptoCompare API error: ${response.status}`);
    }

    const data = await response.json() as { Data: Array<{
      title: string;
      body: string;
      source: string;
      url: string;
      published_on: number;
      categories: string;
    }>};
    
    return data.Data.map(article => ({
      title: article.title,
      summary: article.body,
      source: article.source,
      url: article.url,
      publishedAt: new Date(article.published_on * 1000).toISOString(),
      categories: article.categories.split('|'),
      sentiment: article.categories.toLowerCase().includes('positive') ? 'positive' 
        : article.categories.toLowerCase().includes('negative') ? 'negative' 
        : 'neutral'
    }));
  } catch (error) {
    console.error("Error fetching crypto news:", error);
    return [];
  }
}

/**
 * Fetches web3 news from News API
 * * @returns {Promise<NewsArticle[]>} Array of web3 news articles
 * @throws {Error} If news cannot be fetched
 */
async function fetchWeb3News(): Promise<NewsArticle[]> {
  try {
    const NEWS_API_KEY = process.env.NEWS_API_KEY;
    if (!NEWS_API_KEY) {
      throw new Error("NEWS_API_KEY not found in environment variables");
    }

    const query = encodeURIComponent('(web3 OR blockchain OR cryptocurrency OR "crypto" OR "defi" OR "nft")');
    const response = await fetch(
      `https://newsapi.org/v2/everything?q=${query}&language=en&sortBy=publishedAt&pageSize=20`,
      {
        headers: {
          'X-Api-Key': NEWS_API_KEY,
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`News API error: ${response.status}`);
    }

    const data = await response.json() as {
      articles: Array<{
        title: string;
        description: string | null;
        content: string | null;
        url: string;
        publishedAt: string;
        source: {
          name: string;
        };
      }>;
    };
    
    return data.articles.map(article => ({
      title: article.title,
      summary: article.description || article.content?.substring(0, 200) + '...',
      source: article.source.name,
      url: article.url,
      publishedAt: article.publishedAt,
      categories: ['web3', 'blockchain'],
      sentiment: 'neutral'
    }));
  } catch (error) {
    console.error("Error fetching web3 news:", error);
    return [];
  }
}

/**
 * Analyzes articles to identify trending topics
 * * @param {NewsArticle[]} articles - Array of news articles to analyze
 * @returns {string[]} Array of trending topics
 */
function analyzeTrendingTopics(articles: NewsArticle[]): string[] {
  const wordFrequency: { [key: string]: number } = {};
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about', 'as', 'of']);
  
  articles.forEach(article => {
    const text = `${article.title} ${article.summary}`.toLowerCase();
    const words = text.split(/\W+/).filter(word => 
      word.length > 3 && !stopWords.has(word)
    );
    
    words.forEach(word => {
      wordFrequency[word] = (wordFrequency[word] || 0) + 1;
    });
  });

  return Object.entries(wordFrequency)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([word]) => word);
}

export async function getOnChainTokenData(tokenAddress: string): Promise<OnChainTokenData> {
  try {
    if (!isValidSolanaAddress(tokenAddress)) {
      throw new Error("Invalid token address format");
    }

    const pubKey = new PublicKey(tokenAddress);
    
    const tokenInfo = await withRetry(async () => 
      connection.getParsedAccountInfo(pubKey)
    );
    
    if (!tokenInfo.value || !tokenInfo.value.data) {
      throw new Error("Token account not found");
    }

    const parsedData = (tokenInfo.value.data as any).parsed;
    if (!parsedData || !parsedData.info) {
      throw new Error("Invalid token data format");
    }

    return {
      supply: Number(parsedData.info.supply),
      decimals: parsedData.info.decimals,
      mintAuthority: parsedData.info.mintAuthority,
      freezeAuthority: parsedData.info.freezeAuthority
    };
  } catch (error) {
    console.error("Error fetching on-chain token data:", error);
    throw error;
  }
}

export async function getTokenHoldersDistribution(tokenAddress: string): Promise<TokenHolder[]> {
  try {
    if (!isValidSolanaAddress(tokenAddress)) {
      throw new Error("Invalid token address format");
    }

    const pubKey = new PublicKey(tokenAddress);
    
    const tokenAccounts = await withRetry(async () => 
      connection.getTokenLargestAccounts(pubKey)
    );
    
    if (!tokenAccounts.value) {
      throw new Error("No token accounts found");
    }

    const totalSupplyAccount = await getOnChainTokenData(tokenAddress);
    const totalSupply = totalSupplyAccount.supply / Math.pow(10, totalSupplyAccount.decimals);
    
    if (totalSupply === 0) {
      return [];
    }
    
    return tokenAccounts.value.map(account => {
      const balance = Number(account.uiAmount);
      return {
        address: account.address.toString(),
        balance: balance,
        percentage: (balance / totalSupply) * 100
      };
    });
  } catch (error) {
    console.error("Error fetching token holders:", error);
    return [];
  }
}

export async function analyzeTransactionPatterns(tokenAddress: string): Promise<{ score: number; factors: string[] }> {
  try {
    const transactions = await getRecentTransactions(tokenAddress, 100);
    const factors: string[] = [];
    let score = 100;

    if (transactions.length < 10) {
        score -= 20;
        factors.push("Very few transactions found, indicating low activity.");
        return { score: Math.max(0, score), factors };
    }

    const txTypes = transactions.reduce((acc, tx) => {
      acc[tx.type] = (acc[tx.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const failedTxs = transactions.filter(tx => tx.status === "Failed").length;
    if (failedTxs > transactions.length * 0.2) {
      score -= 20;
      factors.push("High rate of failed transactions");
    }

    if (txTypes["Token Transfer"] > transactions.length * 0.8) {
      score -= 15;
      factors.push("Suspicious transaction pattern: High concentration of simple transfers");
    }

    const timeSpan = transactions.length > 1 && transactions[0].timestamp && transactions[transactions.length - 1].timestamp
      ? transactions[0].timestamp! - transactions[transactions.length - 1].timestamp!
      : 0;
    if (timeSpan > 0 && (transactions.length / timeSpan) > 0.1) { // more than 1 tx every 10 seconds
      score -= 10;
      factors.push("Unusual transaction frequency (very high)");
    }

    return { score: Math.max(0, score), factors };
  } catch (error) {
    console.error("Error analyzing transaction patterns:", error);
    return { score: 0, factors: ["Error analyzing transactions"] };
  }
}

export function analyzeHolderConcentration(holders: TokenHolder[]): { score: number; factors: string[] } {
  const factors: string[] = [];
  let score = 100;

  if (holders.length === 0) {
    return { score: 0, factors: ["No holder data available"] };
  }

  const topHolder = holders[0];
  if (topHolder.percentage > 50) {
    score -= 40;
    factors.push(`Extreme concentration: Top holder owns ${topHolder.percentage.toFixed(2)}%`);
  } else if (topHolder.percentage > 20) {
    score -= 25;
    factors.push(`High concentration: Top holder owns ${topHolder.percentage.toFixed(2)}%`);
  }

  const top10Percentage = holders.slice(0, 10).reduce((sum, h) => sum + h.percentage, 0);
  if (top10Percentage > 90) {
    score -= 30;
    factors.push(`Extreme top 10 concentration: ${top10Percentage.toFixed(2)}%`);
  } else if (top10Percentage > 70) {
    score -= 20;
    factors.push(`High top 10 concentration: ${top10Percentage.toFixed(2)}%`);
  }

  return { score: Math.max(0, score), factors };
}

export async function analyzeLiquidityAndContract(tokenAddress: string): Promise<{ liquidityScore: number, contractRiskScore: number, factors: string[] }> {
  try {
    const factors: string[] = [];
    let liquidityScore = 100;
    let contractRiskScore = 100;

    const [tokenData, transactions] = await Promise.all([
      getOnChainTokenData(tokenAddress),
      getRecentTransactions(tokenAddress, 100)
    ]);
    
    const totalVolume = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const avgVolume = totalVolume / (transactions.length || 1);
    
    if (avgVolume < 1) {
      liquidityScore -= 20;
      factors.push("Very low average transaction SOL volume");
    } else if (avgVolume < 10) {
      liquidityScore -= 10;
      factors.push("Low average transaction SOL volume");
    }

    if (transactions.length > 1 && transactions[0].timestamp && transactions[transactions.length-1].timestamp) {
      const timeSpanSeconds = transactions[0].timestamp! - transactions[transactions.length - 1].timestamp!;
      if(timeSpanSeconds > 0) {
        const txPerDay = (transactions.length / (timeSpanSeconds / 86400));
        if (txPerDay < 10) {
            liquidityScore -= 20;
            factors.push("Very low transaction frequency (less than 10 txs per day)");
        } else if (txPerDay < 50) {
            liquidityScore -= 10;
            factors.push("Low transaction frequency (less than 50 txs per day)");
        }
      }
    } else if (transactions.length <= 1) {
        liquidityScore -= 30;
        factors.push("Negligible transaction history found.");
    }

    if (tokenData.mintAuthority) {
      contractRiskScore -= 50;
      factors.push("DANGER: Active mint authority - token supply can be inflated at will.");
    }

    if (tokenData.freezeAuthority) {
      contractRiskScore -= 40;
      factors.push("WARNING: Active freeze authority - token holders can be frozen.");
    }

    return { 
        liquidityScore: Math.max(0, liquidityScore), 
        contractRiskScore: Math.max(0, contractRiskScore),
        factors
    };
  } catch (error) {
    console.error("Error analyzing liquidity and contract:", error);
    return { 
      liquidityScore: 0, 
      contractRiskScore: 0,
      factors: [`Error analyzing on-chain data: ${error instanceof Error ? error.message : 'Unknown error'}`] 
    };
  }
}

/**
 * [NEW] Main analysis function that combines all risk metrics.
 */
export async function analyzeTokenRisk(tokenAddress: string): Promise<TokenRiskMetrics> {
  if (!isValidSolanaAddress(tokenAddress)) {
    throw new Error("Invalid Solana token address provided.");
  }
  
  const [
    liquidityAndContractAnalysis,
    holders,
    transactionAnalysis,
  ] = await Promise.all([
    analyzeLiquidityAndContract(tokenAddress),
    getTokenHoldersDistribution(tokenAddress),
    analyzeTransactionPatterns(tokenAddress),
  ]);

  const holderAnalysis = analyzeHolderConcentration(holders);

  const allFactors = [
    ...liquidityAndContractAnalysis.factors,
    ...holderAnalysis.factors,
    ...transactionAnalysis.factors,
  ];

  const scores = [
    liquidityAndContractAnalysis.liquidityScore,
    liquidityAndContractAnalysis.contractRiskScore,
    holderAnalysis.score,
    transactionAnalysis.score,
  ];
  
  const overallRiskScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

  return {
    liquidityScore: liquidityAndContractAnalysis.liquidityScore,
    contractRiskScore: liquidityAndContractAnalysis.contractRiskScore,
    holderConcentrationScore: holderAnalysis.score,
    transactionPatternScore: transactionAnalysis.score,
    overallRiskScore: Math.round(overallRiskScore),
    riskFactors: allFactors.length > 0 ? allFactors : ["No significant risk factors identified."],
  };
}


// --- Tool Wrappers (exported) ---
export const getSolBalanceTool = createTool({
  id: "get-sol-balance",
  description: "Get the SOL balance for a given Solana wallet address.",
  inputSchema: z.object({ walletAddress: z.string() }),
  outputSchema: z.object({ 
    balance: z.number().nullable(),
    error: z.string().optional()
  }),
  execute: async ({ context }) => {
    const { walletAddress } = context;
    const balance = await getSolBalance(walletAddress);
    
    if (balance === null) {
      return { 
        balance: null, 
        error: "Failed to fetch SOL balance. Please check the wallet address and try again." 
      };
    }
    
    return { balance };
  },
});

export const getTokenBalanceTool = createTool({
  id: "get-token-balance",
  description: "Get the SPL token balance for a given wallet and token mint address.",
  inputSchema: z.object({
    walletAddress: z.string(),
    tokenMint: z.string(),
  }),
  outputSchema: z.object({
    balance: z.number(),
    decimals: z.number(),
  }),
  execute: async ({ context }) => {
    const { walletAddress, tokenMint } = context;
    return await getTokenBalance(walletAddress, tokenMint);
  },
});

export const getTokenPriceDataTool = createTool({
  id: "get-token-price-data",
  description: "Get price and price change data for a token from CoinGecko.",
  inputSchema: z.object({
    tokenId: z.string().describe("The token's CoinGecko ID, symbol, or name."),
  }),
  outputSchema: z.object({
    name: z.string(),
    symbol: z.string(),
    price: z.number(),
    priceChange24h: z.number(),
    priceChange7d: z.number(),
    volume24h: z.number(),
    lastUpdated: z.string(),
    tokenId: z.string(),
  }),
  execute: async ({ context }) => {
    const { tokenId } = context;
    return await getTokenPriceData(tokenId);
  },
});

export const getAllNewsTool = createTool({
  id: "get-all-news",
  description: "Fetch the latest crypto and web3 news articles.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    articles: z.array(z.object({
      title: z.string(),
      summary: z.string(),
      source: z.string(),
      url: z.string(),
      publishedAt: z.string(),
      categories: z.array(z.string()),
      sentiment: z.string().optional(),
      relevanceScore: z.number().optional(),
    })),
    totalResults: z.number(),
    lastUpdated: z.string(),
    trendingTopics: z.array(z.string()),
  }),
  execute: async () => {
    return await getAllNews();
  },
});

export const getRecentTransactionsTool = createTool({
  id: "get-recent-transactions",
  description: "Get recent transactions for a wallet or token address.",
  inputSchema: z.object({
    address: z.string().describe("The Solana wallet or token address."),
    limit: z.number().min(1).max(100).default(10).optional(),
  }),
  outputSchema: z.array(z.object({
    signature: z.string(),
    timestamp: z.number().nullable().optional(),
    type: z.string(),
    amount: z.number(),
    programIds: z.array(z.string()),
    status: z.string(),
  })),
  execute: async ({ context }) => {
    const { address, limit } = context;
    return await getRecentTransactions(address, limit ?? 10);
  },
});

export const getOnChainTokenDataTool = createTool({
  id: "get-onchain-token-data",
  description: "Get on-chain metadata for a Solana token mint address.",
  inputSchema: z.object({
    tokenAddress: z.string().describe("The Solana token mint address."),
  }),
  outputSchema: z.object({
    supply: z.number(),
    decimals: z.number(),
    mintAuthority: z.string().nullable(),
    freezeAuthority: z.string().nullable(),
  }),
  execute: async ({ context }) => {
    const { tokenAddress } = context;
    return await getOnChainTokenData(tokenAddress);
  },
});

/**
 * [NEW TOOL]
 * The missing tool that combines all analysis functions.
 */
export const analyzeTokenRiskTool = createTool({
  id: "analyze-solana-token-risk",
  description: "Analyzes a Solana token for risk factors including liquidity, holder concentration, and contract vulnerabilities.",
  inputSchema: z.object({
    tokenAddress: z.string().describe("The Solana token mint address to analyze."),
  }),
  outputSchema: z.object({
    liquidityScore: z.number(),
    holderConcentrationScore: z.number(),
    transactionPatternScore: z.number(),
    contractRiskScore: z.number(),
    overallRiskScore: z.number(),
    riskFactors: z.array(z.string()),
  }),
  execute: async ({ context }) => {
    const { tokenAddress } = context;
    return await analyzeTokenRisk(tokenAddress);
  },
});