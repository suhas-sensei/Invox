"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import CipherText from "@/components/CipherText";

const invoices = [
  { vendor: "AWS", from: "billing@aws.amazon.com", subject: "Your invoice for March 2026", amount: "$3,500.00", date: "1 Apr", labels: ["Cloud"], color: "#FF9900", chart: [30, 45, 38, 60, 55, 70, 65, 80, 75, 90] },
  { vendor: "Figma", from: "billing@figma.com", subject: "Receipt for Team Plan", amount: "$75.00", date: "28 Mar", labels: ["Design"], color: "#A259FF", chart: [10, 12, 11, 14, 13, 15, 14, 15, 15, 15] },
  { vendor: "GitHub", from: "noreply@github.com", subject: "Enterprise License Invoice", amount: "$231.00", date: "25 Mar", labels: ["DevTools"], color: "#24292F", chart: [20, 22, 25, 24, 28, 30, 32, 35, 33, 38] },
  { vendor: "Notion", from: "billing@notion.so", subject: "Workspace billing receipt", amount: "$48.00", date: "22 Mar", labels: ["Productivity"], color: "#000000", chart: [8, 8, 9, 8, 9, 9, 10, 9, 10, 10] },
  { vendor: "Stripe", from: "receipts@stripe.com", subject: "Platform fee invoice", amount: "$189.50", date: "20 Mar", labels: ["Payments"], color: "#635BFF", chart: [15, 18, 22, 20, 25, 28, 30, 27, 32, 35] },
  { vendor: "Vercel", from: "invoices@vercel.com", subject: "Pro Plan - March 2026", amount: "$20.00", date: "18 Mar", labels: ["Hosting"], color: "#000000", chart: [5, 5, 6, 5, 6, 6, 7, 6, 7, 7] },
  { vendor: "Slack", from: "billing@slack.com", subject: "Business+ plan invoice", amount: "$150.00", date: "15 Mar", labels: ["Comms"], color: "#4A154B", chart: [25, 28, 30, 32, 30, 35, 33, 38, 36, 40] },
  { vendor: "Supabase", from: "billing@supabase.io", subject: "Pro Database hosting", amount: "$25.00", date: "12 Mar", labels: ["Database"], color: "#3ECF8E", chart: [4, 5, 6, 5, 7, 8, 7, 9, 8, 10] },
];

const positions: Array<Record<string, string | number>> = [
  { top: "2%", left: "3%", width: 240 },
  { top: "2%", right: "3%", width: 240 },
  { top: "25%", left: "18%", width: 220 },
  { top: "60%", left: "3%", width: 240 },
  { top: "25%", right: "18%", width: 220 },
  { top: "60%", right: "3%", width: 240 },
  { bottom: "2%", left: "20%", width: 230 },
  { bottom: "2%", right: "20%", width: 230 },
];

function MiniChart({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 120;
  const h = 32;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  const fill = points + ` ${w},${h} 0,${h}`;

  return (
    <svg width={w} height={h} className="mt-2">
      <defs>
        <linearGradient id={`g-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={fill} fill={`url(#g-${color.replace("#", "")})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export default function EmployeePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#fafafa]" />}>
      <EmployeeContent />
    </Suspense>
  );
}

function EmployeeContent() {
  const searchParams = useSearchParams();
  const gmailConnected = searchParams.get("gmail") === "connected";

  // If Gmail just connected, redirect to dashboard
  if (gmailConnected) {
    if (typeof window !== "undefined") {
      window.location.href = "/dashboard?gmail=connected";
    }
    return <div className="min-h-screen bg-[#fafafa] flex items-center justify-center text-black/30">Redirecting to dashboard...</div>;
  }

  const [connecting, setConnecting] = useState(false);

  const handleGmailConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch("/api/auth/gmail");
      const data = await res.json();
      if (data.authUrl) window.location.href = data.authUrl;
      else { alert(data.error || "Failed to connect Gmail"); setConnecting(false); }
    } catch {
      alert("Failed to connect");
      setConnecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] relative overflow-hidden">
      <div className="absolute inset-0 z-0 opacity-30">
        <CipherText />
      </div>

      <svg className="absolute inset-0 w-full h-full z-0 pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        {positions.map((pos, i) => {
          const cardX = pos.left ? Number(String(pos.left).replace("%", "")) + 8 : 100 - Number(String(pos.right).replace("%", "")) - 8;
          const cardY = pos.top ? Number(String(pos.top).replace("%", "")) + 8 : 100 - Number(String(pos.bottom).replace("%", "")) - 8;
          const length = Math.sqrt((cardX - 50) ** 2 + (cardY - 50) ** 2);
          return (
            <line key={i} x1="50" y1="50" x2={cardX} y2={cardY} stroke="#c0c0c0" strokeWidth="0.15" strokeDasharray="1 0.7"
              style={{ strokeDashoffset: 0, animation: `dashFlow ${2 + i * 0.4}s linear infinite` }} />
          );
        })}
      </svg>

      {/* Center — Gmail connect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
        <div className="bg-white border border-black/10 rounded-2xl shadow-xl px-8 py-7 text-center max-w-[280px]">
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-red-500 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 18h-2V9.25L12 13 6 9.25V18H4V6h1.2l6.8 4.25L18.8 6H20m0-2H4c-1.11 0-2 .89-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-black mb-1">Connect Gmail</h2>
          <p className="text-xs text-black/50 mb-5">
            Scan your inbox for vendor invoices.<br />
            ZK-verified. Nothing is exposed.
          </p>
          <button
            onClick={handleGmailConnect}
            disabled={connecting}
            className="block w-full bg-black text-white font-medium py-3 px-6 rounded-xl hover:bg-black/90 disabled:bg-black/50 transition-colors text-sm"
          >
            {connecting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Connecting...
              </span>
            ) : "Link your Gmail"}
          </button>
        </div>
      </div>

      {/* Invoice cards */}
      {invoices.map((inv, i) => {
        const pos = positions[i];
        return (
          <div key={inv.vendor} className="absolute bg-white border border-black/8 rounded-xl shadow-sm p-5 z-10"
            style={{ ...pos, animation: `cardFloat 0.6s ease-out ${i * 0.08}s both` }}>
            <p className="text-[10px] text-black/30 mb-2 truncate">{inv.from}</p>
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: inv.color }}>
                  {inv.vendor[0]}
                </div>
                <p className="text-base font-bold text-black">{inv.vendor}</p>
              </div>
              <span className="text-xs bg-black/5 text-black/60 px-2 py-0.5 rounded-full">{inv.labels[0]}</span>
            </div>
            <p className="text-xs text-black/50 mb-1">{inv.subject}</p>
            <MiniChart data={inv.chart} color={inv.color} />
            <div className="flex items-center justify-between mt-3">
              <span className="text-lg font-black text-black">{inv.amount}</span>
              <span className="text-[10px] text-black/30">{inv.date} 2026</span>
            </div>
          </div>
        );
      })}

      <a href="/" className="fixed top-6 left-6 text-sm text-black/40 hover:text-black z-50">← Back</a>

      <style jsx global>{`
        @keyframes cardFloat {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes dashFlow {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -10; }
        }
      `}</style>
    </div>
  );
}
