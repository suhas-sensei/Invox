"use client";

import { useState, useEffect, useCallback } from "react";
import CipherText from "@/components/CipherText";
import { useSolanaWallet } from "@/components/SolanaProvider";
import { useInvoices } from "@/hooks/useInvoices";

const spendingMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function SpendingChart({ data }: { data: number[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data) || 1;
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 600; const h = 100;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  const fill = points + ` ${w},${h} 0,${h}`;
  return (
    <svg width={w} height={h} className="w-full h-[100px]">
      <defs>
        <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fill} fill="url(#spendGrad)" />
      <polyline points={points} fill="none" stroke="#000" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((v, i) => (
        <circle key={i} cx={(i / (data.length - 1)) * w} cy={h - ((v - min) / range) * h} r="3" fill="#000" />
      ))}
    </svg>
  );
}

const statusStyles: Record<string, string> = {
  pending: "text-black/60 bg-black/5 border-black/10",
  approved: "text-black/60 bg-black/5 border-black/10",
  auto_approved: "text-black/60 bg-black/5 border-black/10",
  paid: "text-black/40 bg-black/5 border-black/10",
  rejected: "text-black/40 bg-black/5 border-black/10",
};

export default function AdminDashboardPage() {
  const { address } = useSolanaWallet();
  const { invoices, refresh } = useInvoices();
  const [filter, setFilter] = useState("all");
  const [autoApproveLimit, setAutoApproveLimit] = useState("50");
  const [monthlyCap, setMonthlyCap] = useState("1000");
  const [policyMsg, setPolicyMsg] = useState("");
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  const loadAll = useCallback(() => { refresh(); }, [refresh]);
  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    const interval = setInterval(loadAll, 10000);
    return () => clearInterval(interval);
  }, [loadAll]);

  // Load policy
  useEffect(() => {
    fetch("/api/policy").then(r => r.json()).then(data => {
      if (data.threshold) setAutoApproveLimit(String(data.threshold / 100));
      if (data.monthlyCap) setMonthlyCap(String(data.monthlyCap / 100));
    }).catch(() => {});
  }, []);

  // Computed stats from real data
  const pendingInvoices = invoices.filter(i => i.status === "pending");
  const autoApproved = invoices.filter(i => i.status === "auto_approved");
  const approved = invoices.filter(i => i.status === "approved");
  const paid = invoices.filter(i => i.status === "paid");
  const rejected = invoices.filter(i => i.status === "rejected");
  const payable = [...autoApproved, ...approved];

  const totalAmount = invoices.reduce((s, i) => s + i.amountCents, 0);
  const pendingAmount = pendingInvoices.reduce((s, i) => s + i.amountCents, 0);

  const stats = [
    { label: "Total", value: String(invoices.length) },
    { label: "Pending", value: String(pendingInvoices.length) },
    { label: "Approved", value: String(approved.length) },
    { label: "Auto-Approved", value: String(autoApproved.length) },
    { label: "Paid", value: String(paid.length) },
    { label: "Pending $", value: `$${(pendingAmount / 100).toFixed(2)}` },
  ];

  // Vendor breakdown from real data
  const vendorTotals: Record<string, number> = {};
  invoices.forEach(inv => {
    vendorTotals[inv.vendor] = (vendorTotals[inv.vendor] || 0) + inv.amountCents;
  });
  const topVendors = Object.entries(vendorTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, cents]) => ({
      name,
      amount: `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      pct: totalAmount > 0 ? Math.round((cents / totalAmount) * 100) : 0,
    }));

  // Approval breakdown from real data
  const total = invoices.length || 1;
  const approvalBreakdown = [
    { label: "Auto-Approved", value: Math.round((autoApproved.length / total) * 100), color: "bg-black" },
    { label: "Manually Approved", value: Math.round((approved.length / total) * 100), color: "bg-black/60" },
    { label: "Pending", value: Math.round((pendingInvoices.length / total) * 100), color: "bg-black/30" },
    { label: "Rejected", value: Math.round((rejected.length / total) * 100), color: "bg-black/15" },
  ];

  // Spending chart — monthly totals from real invoice timestamps
  const monthlySpend = new Array(12).fill(0);
  invoices.forEach(inv => {
    const month = new Date(inv.timestamp * 1000).getMonth();
    monthlySpend[month] += inv.amountCents / 100;
  });

  const filtered = filter === "all" ? invoices : invoices.filter(inv => {
    if (filter === "auto") return inv.status === "auto_approved";
    return inv.status === filter;
  });
  const tabs = ["all", "pending", "auto", "approved", "paid", "rejected"];

  const handleSavePolicy = async () => {
    setPolicyMsg("");
    try {
      const res = await fetch("/api/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threshold: Math.round(parseFloat(autoApproveLimit || "0") * 100),
          monthlyCap: Math.round(parseFloat(monthlyCap || "0") * 100),
          adminAddress: address,
        }),
      });
      setPolicyMsg(res.ok ? "Saved on-chain" : "Failed");
    } catch { setPolicyMsg("Failed"); }
    setTimeout(() => setPolicyMsg(""), 3000);
  };

  const handleBatchApprove = async () => {
    const ids = pendingInvoices.map(i => i.id);
    if (ids.length === 0) return;
    setBatchProcessing(true);
    try {
      await fetch("/api/invoice/batch-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceIds: ids, adminAddress: address }),
      });
      loadAll();
    } finally { setBatchProcessing(false); }
  };

  const handleBatchPay = async () => {
    const ids = payable.map(i => i.id);
    if (ids.length === 0) return;
    setBatchProcessing(true);
    try {
      await fetch("/api/invoice/batch-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceIds: ids, adminAddress: address }),
      });
      loadAll();
    } finally { setBatchProcessing(false); }
  };

  const handleApprove = async (id: number) => {
    await fetch("/api/invoice/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: id, adminAddress: address, employeeAddress: invoices.find(i => i.id === id)?.employee, amountCents: invoices.find(i => i.id === id)?.amountCents }),
    });
    loadAll();
  };

  const handleReject = async (id: number) => {
    await fetch("/api/invoice/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: id, adminAddress: address }),
    });
    loadAll();
  };

  const handlePay = async (inv: typeof invoices[0]) => {
    setPayingId(inv.id);
    setPayError(null);
    try {
      const res = await fetch("/api/invoice/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: inv.id, adminAddress: address, employeeAddress: inv.employee, amountCents: inv.amountCents }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPayError(`Invoice #${inv.id}: ${data.error}`);
      }
      loadAll();
    } catch (e) {
      setPayError(`Invoice #${inv.id}: ${e instanceof Error ? e.message : "Payment failed"}`);
    } finally {
      setPayingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] relative overflow-hidden">
      <div className="absolute inset-0 z-0 opacity-30">
        <CipherText />
      </div>

      <div className="relative z-10 p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-black tracking-tight text-black">Admin</h1>
          <a href="/" className="text-sm text-black/30 hover:text-black/60 transition-colors">← Back</a>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-6 gap-3 mb-6">
          {stats.map((s, i) => (
            <div key={s.label} className="bg-white border border-black/8 rounded-xl shadow-sm p-4"
              style={{ animation: `cardFloat 0.6s ease-out ${i * 0.06}s both` }}>
              <p className="text-xs text-black/40 mb-2">{s.label}</p>
              <p className="text-2xl font-black text-black">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            {/* Policy */}
            <div className="bg-white border border-black/8 rounded-xl shadow-sm p-6 mb-5">
              <h2 className="text-base font-bold text-black mb-4">On-Chain Policy Engine</h2>
              <div className="flex items-end gap-4">
                <div>
                  <p className="text-xs text-black/40 mb-1.5">Auto-approve under ($)</p>
                  <input value={autoApproveLimit} onChange={e => setAutoApproveLimit(e.target.value)}
                    className="bg-black/5 border border-black/10 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:border-black/30 text-black" />
                </div>
                <div>
                  <p className="text-xs text-black/40 mb-1.5">Monthly cap per employee ($)</p>
                  <input value={monthlyCap} onChange={e => setMonthlyCap(e.target.value)}
                    className="bg-black/5 border border-black/10 rounded-lg px-3 py-2 text-sm w-32 focus:outline-none focus:border-black/30 text-black" />
                </div>
                <button onClick={handleSavePolicy} className="bg-black text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-black/80 transition-colors">
                  Save to Chain
                </button>
                {policyMsg && <span className="text-xs text-black/40">{policyMsg}</span>}
              </div>
            </div>

            {/* Bulk actions */}
            <div className="flex gap-3 mb-6">
              <button onClick={handleBatchApprove} disabled={batchProcessing || pendingInvoices.length === 0}
                className="bg-white border border-black/10 shadow-sm text-black/40 disabled:text-black/20 text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-black/5 transition-colors">
                {batchProcessing ? "Processing..." : `Approve All Pending (${pendingInvoices.length})`}
              </button>
              <button onClick={handleBatchPay} disabled={batchProcessing || payable.length === 0}
                className="bg-black text-white disabled:bg-black/30 text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-black/80 transition-colors">
                {batchProcessing ? "Processing..." : `Pay All Approved (${payable.length})`}
              </button>
            </div>

            {/* Error display */}
            {payError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                {payError}
              </div>
            )}

            {/* Filters */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-2">
                {tabs.map(t => (
                  <button key={t} onClick={() => setFilter(t)}
                    className={`text-sm px-3 py-1.5 rounded-lg transition-colors capitalize font-medium ${
                      filter === t ? "bg-black text-white" : "bg-white border border-black/8 text-black/50 hover:text-black shadow-sm"
                    }`}>
                    {t === "auto" ? "Auto" : t}
                  </button>
                ))}
              </div>
              <button onClick={loadAll} className="text-sm text-black/30 hover:text-black/60 transition-colors">Refresh</button>
            </div>

            {/* Table */}
            <div className="bg-white border border-black/8 rounded-xl shadow-sm overflow-hidden">
              <div className="grid grid-cols-[60px_1fr_1fr_100px_120px_100px_140px] gap-4 px-5 py-3 border-b border-black/5">
                {["ID", "Employee", "Vendor", "Amount", "Status", "Proof", "Actions"].map(h => (
                  <p key={h} className="text-xs font-semibold text-black/30 uppercase tracking-wide">{h}</p>
                ))}
              </div>
              {filtered.length === 0 ? (
                <p className="px-5 py-8 text-sm text-black/30 text-center">No invoices found.</p>
              ) : filtered.map((inv, i) => (
                <div key={inv.id}
                  className={`grid grid-cols-[60px_1fr_1fr_100px_120px_100px_140px] gap-4 px-5 py-4 items-center hover:bg-black/[0.02] transition-colors ${i < filtered.length - 1 ? "border-b border-black/5" : ""}`}>
                  <p className="text-sm text-black/40 font-mono">#{inv.id}</p>
                  <p className="text-sm font-mono text-black/60 truncate">{inv.employee.slice(0, 6)}...{inv.employee.slice(-4)}</p>
                  <p className="text-sm font-medium text-black">{inv.vendor}</p>
                  <p className="text-sm font-bold text-black">${(inv.amountCents / 100).toFixed(2)}</p>
                  <div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-md border capitalize ${statusStyles[inv.status] || statusStyles.pending}`}>
                      {inv.status === "auto_approved" ? "Auto" : inv.status}
                    </span>
                  </div>
                  <p className={`text-sm font-medium ${inv.proofVerified ? "text-black/60" : "text-black/30"}`}>
                    {inv.proofVerified ? "Verified" : "None"}
                  </p>
                  <div className="flex gap-2">
                    {inv.status === "pending" && (
                      <>
                        <button onClick={() => handleApprove(inv.id)} className="bg-black text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-black/80 transition-colors">Approve</button>
                        <button onClick={() => handleReject(inv.id)} className="bg-black/5 text-black/50 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-black/10 transition-colors">Reject</button>
                      </>
                    )}
                    {(inv.status === "approved" || inv.status === "auto_approved") && (
                      <button onClick={() => handlePay(inv)} disabled={payingId === inv.id}
                        className="bg-black text-white disabled:bg-black/30 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-black/80 transition-colors">
                        {payingId === inv.id ? "Paying..." : "Pay"}
                      </button>
                    )}
                    {inv.paymentTx && (
                      <>
                        <a href={`https://sepolia.solscan.io/tx/${inv.paymentTx}`} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-black/30 hover:text-black leading-6">View Tx →</a>
                        <span className="text-[10px] text-black/30 border border-black/10 px-1.5 py-0.5 rounded" title="Receipt NFT minted">NFT ✓</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right analytics */}
          <div className="w-[300px] flex-shrink-0 space-y-4">
            <div className="bg-white border border-black/8 rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-bold text-black">Total Spending</p>
                <p className="text-[10px] text-black/30">12 months</p>
              </div>
              <p className="text-2xl font-black text-black mb-3">${(totalAmount / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
              <SpendingChart data={monthlySpend} />
              <div className="flex justify-between mt-2">
                {spendingMonths.map((m, i) => (
                  <span key={m} className={`text-[8px] ${new Date().getMonth() === i ? "font-bold text-black" : "text-black/20"}`}>{m}</span>
                ))}
              </div>
            </div>

            <div className="bg-white border border-black/8 rounded-xl shadow-sm p-5">
              <p className="text-sm font-bold text-black mb-3">Approval Breakdown</p>
              <div className="flex gap-0.5 h-2 rounded-full overflow-hidden mb-4">
                {approvalBreakdown.map(a => (
                  <div key={a.label} className={`${a.color} h-full`} style={{ width: `${a.value}%` }} />
                ))}
              </div>
              <div className="space-y-2.5">
                {approvalBreakdown.map(a => (
                  <div key={a.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${a.color}`} />
                      <span className="text-xs text-black/60">{a.label}</span>
                    </div>
                    <span className="text-xs font-bold text-black">{a.value}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-black/8 rounded-xl shadow-sm p-5">
              <p className="text-sm font-bold text-black mb-4">Top Vendors</p>
              <div className="space-y-3">
                {topVendors.map(v => (
                  <div key={v.name}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-medium text-black">{v.name}</span>
                      <span className="text-xs font-bold text-black">{v.amount}</span>
                    </div>
                    <div className="h-1.5 bg-black/5 rounded-full overflow-hidden">
                      <div className="h-full bg-black rounded-full" style={{ width: `${v.pct}%` }} />
                    </div>
                  </div>
                ))}
                {topVendors.length === 0 && <p className="text-xs text-black/30">No data yet</p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes cardFloat {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
