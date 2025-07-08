/**
 * Solana Onchain Assistant - Helper Functions
 * 
 * This file contains all the helper functions and interfaces used by the Solana Onchain Assistant.
 * It provides core functionality for:
 * - Blockchain interaction (connection, address validation)
 * - Token operations (balance checking, price fetching)
 * - Transaction analysis
 * - News aggregation
 * - Risk analysis
 * 
 * 
 * @module src/helpers
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import fetch from "node-fetch";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Initialize Solana connection with Alchemy RPC
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
if (!ALCHEMY_API_KEY) {
  throw new Error(
    "ALCHEMY_API_KEY not found in environment variables. " +
    "Please create a .env file in the root directory with ALCHEMY_API_KEY=your-alchemy-api-key"
  );
}

/**
 * Solana network connection instance
 * Configured to use the mainnet-beta network with commitment level 'confirmed'
 */
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

// Helper Functions
/**
 * Validates if a string is a valid Solana wallet address
 * 
 * @param {string} address - The address to validate
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
 * Retrieves the SOL balance for a wallet address
 * 
 * @param {string} walletAddress - The wallet address to check
 * @returns {Promise<number>} The SOL balance in SOL units
 * @throws {Error} If the address is invalid or balance cannot be fetched
 */
export async function getSolBalance(walletAddress: string): Promise<number> {
  try {
    if (!isValidSolanaAddress(walletAddress)) {
      throw new Error("Invalid Solana wallet address format");
    }
    const pubKey = new PublicKey(walletAddress);
    const balance = await connection.getBalance(pubKey);
    return balance / LAMPORTS_PER_SOL;
  } catch (error) {
    console.error("Error fetching token balance:", error);
    return 0;
  }
}

/**
 * Retrieves the balance of a specific SPL token for a wallet
 * 
 * @param {string} walletAddress - The wallet address to check
 * @param {string} tokenMint - The token's mint address
 * @returns {Promise<{balance: number, decimals: number}>} Token balance and decimals
 * @throws {Error} If the token balance cannot be fetched
 */
export async function getTokenBalance(walletAddress: string) {
  try {
    if (!isValidSolanaAddress(walletAddress)) {
      throw new Error("Invalid Solana wallet address format");
    }
    const pubKey = new PublicKey(walletAddress);
    const balance = await connection.getBalance(pubKey);
    return balance / LAMPORTS_PER_SOL;
  } catch (error) {
    console.error("Error fetching token balance:", error);
    return 0;
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
 * 
 * @param {string} tokenId - The token's CoinGecko ID
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
 * 
 * @param {string} walletAddress - The wallet address to analyze
 * @param {string} timeRange - The time range to analyze (24h, 7d, 30d)
 * @returns {Promise<Transaction[]>} Array of recent transactions
 * @throws {Error} If transactions cannot be fetched
 */
export async function getRecentTransactions(walletAddress: string, limit: number = 10) {
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



/**
 * Fetches and aggregates crypto news from multiple sources
 * 
 * @returns {Promise<NewsResponse>} Aggregated news articles with trending topics
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
 * 
 * @returns {Promise<NewsArticle[]>} Array of crypto news articles
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
 * 
 * @returns {Promise<NewsArticle[]>} Array of web3 news articles
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
 * 
 * @param {NewsArticle[]} articles - Array of news articles to analyze
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

    const totalSupply = tokenAccounts.value.reduce((sum, account) => sum + Number(account.amount), 0);
    
    return tokenAccounts.value.map(account => ({
      address: account.address.toString(),
      balance: Number(account.amount),
      percentage: (Number(account.amount) / totalSupply) * 100
    }));
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
      factors.push("Suspicious transaction pattern: High concentration of transfers");
    }

    const timeSpan = transactions.length > 1 
      ? transactions[0].timestamp! - transactions[transactions.length - 1].timestamp!
      : 0;
    if (timeSpan > 0 && transactions.length / timeSpan > 0.1) {
      score -= 10;
      factors.push("Unusual transaction frequency");
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
    score -= 30;
    factors.push(`Extreme concentration: Top holder owns ${topHolder.percentage.toFixed(2)}%`);
  } else if (topHolder.percentage > 30) {
    score -= 20;
    factors.push(`High concentration: Top holder owns ${topHolder.percentage.toFixed(2)}%`);
  }

  const top10Percentage = holders.slice(0, 10).reduce((sum, h) => sum + h.percentage, 0);
  if (top10Percentage > 90) {
    score -= 25;
    factors.push(`Extreme top 10 concentration: ${top10Percentage.toFixed(2)}%`);
  } else if (top10Percentage > 70) {
    score -= 15;
    factors.push(`High top 10 concentration: ${top10Percentage.toFixed(2)}%`);
  }

  return { score: Math.max(0, score), factors };
}

export async function analyzeLiquidity(tokenAddress: string): Promise<{ score: number; factors: string[] }> {
  try {
    const factors: string[] = [];
    let score = 100;

    const tokenData = await getOnChainTokenData(tokenAddress);
    const transactions = await getRecentTransactions(tokenAddress, 100);
    
    const totalVolume = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const avgVolume = totalVolume / (transactions.length || 1);
    
    if (avgVolume < 0.1) {
      score -= 20;
      factors.push("Very low average transaction volume");
    } else if (avgVolume < 1) {
      score -= 10;
      factors.push("Low average transaction volume");
    }

    if (transactions.length > 0) {
      const timeSpan = transactions[0].timestamp! - transactions[transactions.length - 1].timestamp!;
      const txPerDay = (transactions.length / (timeSpan / 86400)) || 0;
      
      if (txPerDay < 1) {
        score -= 15;
        factors.push("Very low transaction frequency (less than 1 tx per day)");
      } else if (txPerDay < 10) {
        score -= 5;
        factors.push("Low transaction frequency");
      }
    }

    if (tokenData.mintAuthority) {
      score -= 25;
      factors.push("Active mint authority - token supply can be increased");
    }

    if (tokenData.freezeAuthority) {
      score -= 15;
      factors.push("Active freeze authority - accounts can be frozen");
    }

    const uniqueAddresses = new Set(transactions.map(tx => tx.programIds).flat());
    if (uniqueAddresses.size < 3) {
      score -= 10;
      factors.push("Limited program interaction diversity");
    }

    return { score: Math.max(0, score), factors };
  } catch (error) {
    console.error("Error analyzing liquidity:", error);
    return { 
      score: 0, 
      factors: [`Error analyzing on-chain data: ${error instanceof Error ? error.message : 'Unknown error'}`] 
    };
  }
}