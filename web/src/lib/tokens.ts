// Solana devnet tokens
export const SEPOLIA_TOKENS = {
  SOL: "native",
  USDC: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
} as const;

export const TOKEN_LABELS: Record<string, string> = {
  [SEPOLIA_TOKENS.SOL]: "SOL",
  [SEPOLIA_TOKENS.USDC]: "USDC",
  [SEPOLIA_TOKENS.USDT]: "USDT",
};
