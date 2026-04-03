"use client";

import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useSolanaWallet } from "./SolanaProvider";

export function WalletConnect() {
  const { address, isConnected, isConnecting, disconnect } = useSolanaWallet();
  const { setVisible } = useWalletModal();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3 bg-black/5 rounded-lg px-4 py-2">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-sm text-black/70">
          {address.slice(0, 4)}...{address.slice(-4)}
        </span>
        <button
          onClick={disconnect}
          className="text-xs text-black/30 hover:text-black transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setVisible(true)}
      disabled={isConnecting}
      className="bg-black text-white font-medium px-6 py-2 rounded-lg hover:bg-black/90 disabled:bg-black/30 transition-colors text-sm"
    >
      {isConnecting ? "Connecting..." : "Connect Wallet"}
    </button>
  );
}
