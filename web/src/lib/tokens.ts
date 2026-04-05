// Solana devnet tokens
export const SOLANA_TOKENS = {
  SOL: "native",
  USDC: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
} as const;

export const TOKEN_LABELS: Record<string, string> = {
  [SOLANA_TOKENS.SOL]: "SOL",
  [SOLANA_TOKENS.USDC]: "USDC",
  [SOLANA_TOKENS.USDT]: "USDT",
};
