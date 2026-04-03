"use client";

import { useRouter } from "next/navigation";
import CipherText from "@/components/CipherText";
import { useSolanaWallet } from "@/components/SolanaProvider";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

const statCards = [
  { label: "Total Invoices", value: "248", sub: "this month" },
  { label: "Auto-Approved", value: "192", sub: "via policy engine" },
  { label: "Pending Review", value: "12", sub: "awaiting approval" },
  { label: "Total Paid", value: "$48,200", sub: "disbursed" },
  { label: "Active Employees", value: "34", sub: "on-chain" },
  { label: "Policy Threshold", value: "$50", sub: "auto-approve limit" },
  { label: "Monthly Cap", value: "$1,000", sub: "per employee" },
  { label: "ZK Verified", value: "100%", sub: "DKIM proofs" },
];

const positions: Array<Record<string, string | number>> = [
  { top: "3%", left: "2%", width: 210 },
  { top: "3%", right: "2%", width: 210 },
  { top: "28%", left: "14%", width: 200 },
  { top: "62%", left: "2%", width: 210 },
  { top: "28%", right: "14%", width: 200 },
  { top: "62%", right: "2%", width: 210 },
  { bottom: "3%", left: "22%", width: 200 },
  { bottom: "3%", right: "22%", width: 200 },
];

export default function AdminLoginPage() {
  const { isConnected } = useSolanaWallet();
  const { setVisible } = useWalletModal();
  const router = useRouter();

  const handleConnect = async () => {
    if (!isConnected) {
      setVisible(true); await new Promise(r => setTimeout(r, 2000));
      setTimeout(() => router.push("/admin/dashboard"), 500);
    } else {
      router.push("/admin/dashboard");
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] relative overflow-hidden">
      {/* Cipher background */}
      <div className="absolute inset-0 z-0 opacity-30">
        <CipherText />
      </div>

      {/* Dashed connection lines */}
      <svg className="absolute inset-0 w-full h-full z-0 pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        {positions.map((pos, i) => {
          const cardX = pos.left ? Number(String(pos.left).replace("%", "")) + 8 : 100 - Number(String(pos.right).replace("%", "")) - 8;
          const cardY = pos.top ? Number(String(pos.top).replace("%", "")) + 8 : 100 - Number(String(pos.bottom).replace("%", "")) - 8;
          return <line key={i} x1="50" y1="50" x2={cardX} y2={cardY} stroke="#e0e0e0" strokeWidth="0.15" strokeDasharray="1 0.7" />;
        })}
      </svg>

      {/* Scattered stat cards */}
      {statCards.map((card, i) => {
        const pos = positions[i];
        return (
          <div
            key={card.label}
            className="absolute bg-white border border-black/8 rounded-xl shadow-sm p-5 z-10"
            style={{ ...pos, animation: `cardFloat 0.6s ease-out ${i * 0.08}s both` }}
          >
            <p className="text-[10px] text-black/30 mb-1 uppercase tracking-wide">{card.label}</p>
            <p className="text-2xl font-black text-black">{card.value}</p>
            <p className="text-xs text-black/40 mt-1">{card.sub}</p>
          </div>
        );
      })}

      {/* Center login card */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
        <div
          className="bg-white border border-black/10 rounded-2xl shadow-xl px-8 py-7 text-center max-w-[280px]"
          style={{ animation: `cardFloat 0.5s ease-out both` }}
        >
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-black flex items-center justify-center">
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1C8.676 1 6 3.676 6 7v1H4v15h16V8h-2V7c0-3.324-2.676-6-6-6zm0 2c2.276 0 4 1.724 4 4v1H8V7c0-2.276 1.724-4 4-4zm0 9a2 2 0 110 4 2 2 0 010-4z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-black mb-1">Admin Access</h2>
          <p className="text-xs text-black/50 mb-5">
            Connect your wallet to access the<br />
            on-chain admin dashboard.
          </p>
          <button
            onClick={handleConnect}
            className="block w-full bg-black text-white font-medium py-3 px-6 rounded-xl hover:bg-black/80 transition-colors text-sm"
          >
            Connect Wallet
          </button>
        </div>
      </div>

      {/* Back */}
      <a href="/" className="fixed top-6 left-6 text-sm text-black/40 hover:text-black z-50">&larr; Back</a>

      <style jsx global>{`
        @keyframes cardFloat {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
