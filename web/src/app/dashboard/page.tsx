"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useSolanaWallet } from "@/components/SolanaProvider";
import { useInvoices } from "@/hooks/useInvoices";
import { WalletConnect } from "@/components/WalletConnect";
import { ProofStatus } from "@/components/ProofStatus";
import type { ProofStatusType } from "@/components/ProofStatus";
import { SOLANA_TOKENS } from "@/lib/tokens";

interface ScannedEmail {
  messageId: string;
  from: string;
  subject: string;
  date: string;
  vendor: string;
  amountCents: number;
}

const chartData = [40, 55, 45, 70, 60, 80, 65, 90, 75, 95, 85, 70];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function MiniLineChart() {
  const max = Math.max(...chartData);
  const min = Math.min(...chartData);
  const range = max - min || 1;
  const w = 400;
  const h = 160;
  const points = chartData.map((v, i) => `${(i / (chartData.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  const fillPoints = points + ` ${w},${h} 0,${h}`;

  return (
    <svg width={w} height={h} className="w-full h-[160px]">
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fillPoints} fill="url(#chartGrad)" />
      <polyline points={points} fill="none" stroke="#000" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center text-black/30">Loading...</div>}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const { address, isConnected } = useSolanaWallet();
  const { invoices, isLoading, refresh } = useInvoices();
  const searchParams = useSearchParams();
  const [activeTime, setActiveTime] = useState("Month");
  const [activeNav, setActiveNav] = useState(0);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [scannedEmails, setScannedEmails] = useState<ScannedEmail[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [proofStates, setProofStates] = useState<Record<string, ProofStatusType>>({});
  const [proofData, setProofData] = useState<Record<string, { invoiceHash: string; txHash: string; vendor: string; amountCents: number; timestamp: number; proofVerified: boolean }>>({});
  const [viewingProof, setViewingProof] = useState<string | null>(null);
  const [preferredToken, setPreferredToken] = useState<string>(SOLANA_TOKENS.SOL);
  const [copied, setCopied] = useState(false);
  const [receipts, setReceipts] = useState<Array<{ tokenId: number; invoiceId: number; vendor: string; amountCents: number; paymentTx: string; timestamp: number }>>([]);
  const [walletBalance, setWalletBalance] = useState<{ strk: string; eth: string }>({ strk: "0", eth: "0" });

  const navIcons = ["⌂", "✉", "▤", "◉", "⊕", "⚙"];

  // Fetch wallet balance from Solana
  useEffect(() => {
    if (!address) return;
    const fetchBalance = async () => {
      try {
        const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:8899";
        const res = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0", method: "getBalance", id: 1,
            params: [address]
          }),
        });
        const data = await res.json();
        const lamports = data.result?.value ?? 0;
        const sol = (lamports / 1e9).toFixed(4);
        setWalletBalance({ strk: sol, eth: "0" });
      } catch { /* ignore */ }
    };
    fetchBalance();
    const interval = setInterval(fetchBalance, 15000);
    return () => clearInterval(interval);
  }, [address]);

  useEffect(() => {
    if (searchParams.get("gmail") === "connected") setGmailConnected(true);
  }, [searchParams]);

  // Load receipts
  useEffect(() => {
    if (!address) return;
    fetch(`/api/employee/receipts?employee=${address}`)
      .then(r => r.json())
      .then(data => { if (data.receipts) setReceipts(data.receipts); })
      .catch(() => {});
  }, [address, invoices]);

  // Load saved token preference from on-chain
  useEffect(() => {
    if (!address) return;
    fetch(`/api/employee/token?employee=${address}`)
      .then(r => r.json())
      .then(data => { if (data.token) setPreferredToken(data.token); })
      .catch(() => {});
  }, [address]);

  const loadInvoices = useCallback(() => {
    if (address) refresh(address);
  }, [address, refresh]);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);
  useEffect(() => {
    if (!address) return;
    const interval = setInterval(() => refresh(address), 10000);
    return () => clearInterval(interval);
  }, [address, refresh]);

  const handleScan = async () => {
    setIsScanning(true);
    try {
      const res = await fetch("/api/emails/scan", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setScannedEmails(data.emails);
        // Auto-mark emails that are already on-chain as verified
        const onChainVendors = invoices.map(inv => inv.vendor.toLowerCase());
        const autoStates: Record<string, ProofStatusType> = {};
        for (const email of data.emails as ScannedEmail[]) {
          if (onChainVendors.includes(email.vendor.toLowerCase())) {
            autoStates[email.messageId] = "verified";
          }
        }
        if (Object.keys(autoStates).length > 0) {
          setProofStates(p => ({ ...p, ...autoStates }));
        }
      }
    } finally { setIsScanning(false); }
  };

  const handleGenerateProof = async (email: ScannedEmail) => {
    if (!address) return;
    setProofStates((p) => ({ ...p, [email.messageId]: "generating" }));
    try {
      const res = await fetch("/api/proof/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: email.messageId, employeeAddress: address }),
      });
      if (res.ok) {
        const data = await res.json();
        setProofStates((p) => ({ ...p, [email.messageId]: "verified" }));
        setProofData((p) => ({ ...p, [email.messageId]: data }));
        loadInvoices();
      } else {
        const err = await res.json().catch(() => ({}));
        // "Duplicate invoice" means it was already submitted — mark as verified
        if (err.error?.includes("Duplicate") || err.error?.includes("duplicate")) {
          setProofStates((p) => ({ ...p, [email.messageId]: "verified" }));
        } else {
          setProofStates((p) => ({ ...p, [email.messageId]: "failed" }));
        }
      }
    } catch { setProofStates((p) => ({ ...p, [email.messageId]: "failed" })); }
  };

  const totalReimbursed = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amountCents, 0);
  const totalPending = invoices.filter(i => i.status === "pending" || i.status === "auto_approved").reduce((s, i) => s + i.amountCents, 0);
  const verifiedCount = invoices.filter(i => i.proofVerified).length;

  // Don't show login gate — user already connected via landing page.
  // Just show loading if wallet hasn't probed yet.

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex">
      {/* Sidebar */}
      <div className="w-14 flex flex-col items-center pt-4 gap-4 flex-shrink-0">
        {navIcons.map((icon, i) => (
          <button key={i} onClick={() => setActiveNav(i)}
            className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold transition-colors ${activeNav === i ? "bg-black/5 text-black" : "text-black/60 hover:bg-black/5"}`}>
            {icon}
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <div className="h-14 flex items-center px-4 gap-3">
          <span className="text-2xl font-black tracking-tight">Invox</span>
          <div className="flex-1" />
          <WalletConnect />
        </div>

        <div className="flex-1 flex p-6 gap-10">
          {/* Left column */}
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-black mb-5">Dashboard</h2>

            {/* Wallet + upcoming */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-2xl p-6 text-white relative overflow-hidden">
                <div className="flex justify-between items-start mb-8">
                  <span className="text-xl text-white/30">◉</span>
                  <span className="text-base text-white/40">Solana</span>
                </div>
                <p
                  className="text-xl font-mono tracking-widest mb-6 cursor-pointer hover:text-white/80 transition-colors"
                  title="Click to copy"
                  onClick={() => { if (address) { navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 2000); } }}
                >
                  {address ? `${address.slice(0, 6)} ···· ${address.slice(-4)}` : "..."}
                  {copied && <span className="text-xs text-white/50 ml-2">Copied!</span>}
                </p>
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-xs text-white/30 uppercase tracking-wider mb-1">Employee</p>
                    <p
                      className="text-sm font-semibold cursor-pointer hover:text-white/80 transition-colors"
                      title="Click to copy full address"
                      onClick={() => { if (address) { navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 2000); } }}
                    >
                      {address?.slice(0, 10)}...
                    </p>
                  </div>
                  <p className="text-lg font-bold text-white/60">Devnet</p>
                </div>
                <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between">
                  <p className="text-xs text-white/70 uppercase tracking-wider">Receive in</p>
                  <button
                    onClick={async () => {
                      const tokens: string[] = [SOLANA_TOKENS.SOL, SOLANA_TOKENS.USDC, SOLANA_TOKENS.USDT];
                      const idx = tokens.indexOf(preferredToken);
                      const next = tokens[(idx + 1) % tokens.length];
                      setPreferredToken(next);
                      // Save on-chain
                      if (address) {
                        fetch("/api/employee/token", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ employee: address, token: next }),
                        }).catch(() => {});
                      }
                    }}
                    className="text-sm font-bold text-white hover:text-white/70 transition-colors"
                  >
                    {{ [SOLANA_TOKENS.SOL]: "SOL", [SOLANA_TOKENS.USDC]: "USDC", [SOLANA_TOKENS.USDT]: "USDT" }[preferredToken] || "SOL"}
                  </button>
                </div>
              </div>

              <div>
                <p className="text-base font-medium text-black/40 mb-3">Pending Reimbursement</p>
                <p className="text-3xl font-black text-black mb-2">${(totalPending / 100).toFixed(2)}</p>
                <p className="text-sm text-black/40 mb-5">{invoices.filter(i => i.status === "pending" || i.status === "auto_approved").length} invoices awaiting payment</p>

                <p className="text-base font-medium text-black/40 mb-2">Wallet Balance</p>
                <div className="flex gap-6">
                  <div>
                    <p className="text-2xl font-black text-black">{walletBalance.strk}</p>
                    <p className="text-xs text-black/30">SOL</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Gmail connect + scan */}
            {!gmailConnected ? (
              <div className="mb-6">
                <a href="/api/auth/gmail" className="inline-block bg-black text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-black/90 transition-colors"
                  onClick={async (e) => { e.preventDefault(); const r = await fetch("/api/auth/gmail"); const d = await r.json(); if (d.authUrl) window.location.href = d.authUrl; }}>
                  Connect Gmail to Scan Invoices
                </a>
              </div>
            ) : (
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-black">Scanned Emails</h3>
                <button onClick={handleScan} disabled={isScanning}
                  className="bg-black text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-black/90 disabled:bg-black/30 transition-colors">
                  {isScanning ? "Scanning..." : "Scan Invoices"}
                </button>
              </div>
            )}

            {/* Scanned emails list */}
            {scannedEmails.length > 0 && (
              <div className="mb-6">
                {scannedEmails.map((email) => {
                  const isVerified = proofStates[email.messageId] === "verified";
                  return (
                  <div key={email.messageId} className={`flex items-center py-3 border-b border-black/5 hover:bg-black/[0.02] transition-colors ${isVerified ? "opacity-35" : ""}`}>
                    <span className="w-9 h-9 bg-black/5 rounded-lg flex items-center justify-center text-sm text-black/40 flex-shrink-0">✉</span>
                    <div className="ml-3 flex-1 min-w-0">
                      <p className="text-sm font-medium text-black">{email.vendor}</p>
                      <p className="text-xs text-black/40 truncate">{email.subject}</p>
                    </div>
                    <p className="text-sm font-bold text-black mx-4">${(email.amountCents / 100).toFixed(2)}</p>
                    <ProofStatus status={proofStates[email.messageId] || "none"} />
                    <div className="ml-3 flex gap-2">
                      <button onClick={() => handleGenerateProof(email)}
                        disabled={proofStates[email.messageId] === "generating" || proofStates[email.messageId] === "verified"}
                        className="text-xs bg-black hover:bg-black/80 disabled:bg-black/20 disabled:text-black/40 text-white px-3 py-1.5 rounded transition-colors">
                        {proofStates[email.messageId] === "verified" ? "Submitted" : "Generate Proof"}
                      </button>
                      {proofData[email.messageId] && (
                        <button onClick={() => setViewingProof(email.messageId)}
                          className="text-xs border border-black/20 text-black px-3 py-1.5 rounded hover:bg-black/5 transition-colors">
                          View Proof
                        </button>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}

            {/* On-chain invoices */}
            <h3 className="text-xl font-semibold text-black mb-3">On-Chain Invoices</h3>
            {isLoading ? (
              <p className="text-sm text-black/30">Loading...</p>
            ) : invoices.length === 0 ? (
              <p className="text-sm text-black/30">No invoices yet. Scan your Gmail and generate proofs.</p>
            ) : (
              <div>
                {invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center py-3 border-b border-black/5 hover:bg-black/[0.02] transition-colors">
                    <span className="text-xs text-black/30 font-mono w-8">#{inv.id}</span>
                    <p className="text-sm font-medium text-black flex-1 ml-2">{inv.vendor}</p>
                    <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full mx-3 ${
                      inv.status === "paid" ? "bg-green-50 text-green-700" :
                      inv.status === "auto_approved" ? "bg-cyan-50 text-cyan-700" :
                      inv.status === "rejected" ? "bg-red-50 text-red-700" :
                      "bg-yellow-50 text-yellow-700"
                    }`}>{inv.status === "auto_approved" ? "auto" : inv.status}</span>
                    <p className="text-sm font-bold text-black w-20 text-right">${(inv.amountCents / 100).toFixed(2)}</p>
                    {inv.paymentTx && (
                      <a href={`https://solscan.io/tx/${inv.paymentTx}`} target="_blank" rel="noopener noreferrer"
                        className="ml-3 text-xs text-black/40 hover:text-black">View Tx →</a>
                    )}
                    {inv.status === "paid" && (
                      <span className="ml-2 text-[10px] text-black/30 border border-black/10 px-1.5 py-0.5 rounded" title="Receipt NFT minted">NFT ✓</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* My Receipts (NFTs) */}
            {receipts.length > 0 && (
              <>
                <h3 className="text-xl font-semibold text-black mb-3 mt-8">My Receipts</h3>
                <p className="text-xs text-black/40 mb-3">{receipts.length} receipt NFT{receipts.length > 1 ? "s" : ""} minted on-chain (ZVRC)</p>
                <div className="grid grid-cols-2 gap-3">
                  {receipts.map((r) => (
                    <div key={r.tokenId} className="border border-black/8 rounded-lg p-4 hover:border-black/15 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] text-black/30 font-mono">ZVRC #{r.tokenId}</span>
                        <span className="text-[10px] text-black/30">Invoice #{r.invoiceId}</span>
                      </div>
                      <p className="text-sm font-semibold text-black">{r.vendor}</p>
                      <p className="text-lg font-black text-black mt-1">${(r.amountCents / 100).toFixed(2)}</p>
                      <p className="text-[10px] text-black/30 mt-2">{new Date(r.timestamp * 1000).toLocaleDateString()}</p>
                      <a
                        href={`https://solscan.io/tx/${r.paymentTx}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-black/40 hover:text-black mt-1 block"
                      >
                        View payment tx →
                      </a>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Right column */}
          <div className="w-[320px] flex-shrink-0">
            <div className="mb-6">
              <p className="text-base text-black/40 mb-1">Reimbursed This Month</p>
              <p className="text-4xl font-black text-black mb-4">${(totalReimbursed / 100).toFixed(2)}</p>
              <div className="flex gap-1 mb-3">
                {["Day", "Week", "Month", "Year"].map((t) => (
                  <button key={t} onClick={() => setActiveTime(t)}
                    className={`text-sm px-2.5 py-1 rounded-md transition-colors ${activeTime === t ? "bg-black text-white" : "text-black/30 hover:text-black/60"}`}>
                    {t}
                  </button>
                ))}
              </div>
              <MiniLineChart />
              <div className="flex justify-between mt-1">
                {months.map((m, i) => (
                  <span key={m} className={`text-xs ${i === 3 ? "bg-black text-white px-1 py-0.5 rounded-full" : "text-black/20"}`}>{m}</span>
                ))}
              </div>
            </div>

            <div className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-xl p-4 text-white">
              <p className="text-base text-white/40 mb-0.5">ZK Verification</p>
              <p className="text-lg font-bold mb-3">{verifiedCount} of {invoices.length} Verified</p>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-green-400 rounded-full" style={{ width: invoices.length > 0 ? `${(verifiedCount / invoices.length) * 100}%` : "0%" }} />
                  </div>
                  <p className="text-[9px] text-white/30 mt-1">DKIM verified invoices</p>
                </div>
                <div className="w-12 h-12 rounded-full border-[3px] border-green-400 flex items-center justify-center">
                  <span className="text-[11px] font-black">{invoices.length > 0 ? Math.round((verifiedCount / invoices.length) * 100) : 0}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Proof modal */}
      {viewingProof && proofData[viewingProof] && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setViewingProof(null)}>
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-black">Proof Details</h3>
              <button onClick={() => setViewingProof(null)} className="text-black/30 hover:text-black text-xl">×</button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-black/40 uppercase tracking-wider mb-1">Status</p>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm text-green-700 font-medium">{proofData[viewingProof].proofVerified ? "DKIM Verified" : "Not Verified"}</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-black/40 uppercase tracking-wider mb-1">Invoice Hash</p>
                <p className="text-sm text-black font-mono bg-black/5 rounded px-3 py-2 break-all">{proofData[viewingProof].invoiceHash}</p>
              </div>
              <div>
                <p className="text-xs text-black/40 uppercase tracking-wider mb-1">On-Chain Transaction</p>
                <a href={`https://solscan.io/tx/${proofData[viewingProof].txHash}`} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline font-mono bg-black/5 rounded px-3 py-2 break-all block">
                  {proofData[viewingProof].txHash}
                </a>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-black/40 uppercase tracking-wider mb-1">Vendor</p>
                  <p className="text-sm text-black">{proofData[viewingProof].vendor}</p>
                </div>
                <div>
                  <p className="text-xs text-black/40 uppercase tracking-wider mb-1">Amount</p>
                  <p className="text-sm text-black font-medium">${(proofData[viewingProof].amountCents / 100).toFixed(2)}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-black/40 uppercase tracking-wider mb-1">Verification Method</p>
                <p className="text-sm text-black/60">DKIM Signature — proves the email was sent by the vendor's mail server without exposing content</p>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <a href={`https://solscan.io/tx/${proofData[viewingProof].txHash}`} target="_blank" rel="noopener noreferrer"
                className="flex-1 bg-black text-white text-sm font-medium py-2.5 rounded-lg text-center hover:bg-black/90 transition-colors">
                View on Solscan
              </a>
              <button onClick={() => setViewingProof(null)} className="flex-1 border border-black/10 text-black text-sm font-medium py-2.5 rounded-lg hover:bg-black/5 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
