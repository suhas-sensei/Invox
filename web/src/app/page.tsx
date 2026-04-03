"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import CipherText from "@/components/CipherText";
import { useSolanaWallet } from "@/components/SolanaProvider";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

const images = [
  "/774e61e238994d96a6ef713d02a64d6c.jpg",
  "/975cad8b4e91ae4d0c5d8d78ed349ead.jpg",
  "/af2be367002579446e27cd6806f36685.jpg",
  "/cdf4e8a35cbcf2179ca93787e1eefb2c.jpg",
  "/d5c0526bd3026be11cc26021c6d3216c.jpg",
  "/d6d8bc18862f88ca9e5828c58d6e53cd.jpg",
  "/ed5c10419a2987c5017dc0f2971a60ec.jpg",
  "/f0c5c1baf409717dc563ab385c86a0f1.jpg",
];

const lineItems = [
  { name: "AWS EC2 Instances", qty: 1, rate: 2800, total: 2800 },
  { name: "AWS S3 Storage", qty: 1, rate: 700, total: 700 },
  { name: "Figma Team Plan (8 seats)", qty: 1, rate: 75, total: 75 },
  { name: "GitHub Enterprise License", qty: 7, rate: 33, total: 231 },
  { name: "Notion Workspace", qty: 1, rate: 48, total: 48 },
  { name: "Stripe Platform Fee", qty: 1, rate: 189.5, total: 189.5 },
  { name: "Vercel Pro Plan", qty: 1, rate: 20, total: 20 },
  { name: "Slack Business+ (15 seats)", qty: 1, rate: 150, total: 150 },
];

const today = "2nd April 2026";

type Phase = "cycling" | "stacking" | "spread" | "line";

export default function Home() {
  const { isConnected } = useSolanaWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [activeImage, setActiveImage] = useState(-1);
  const [cycle, setCycle] = useState(0);
  const [phase, setPhase] = useState<Phase>("cycling");
  const [stackedCount, setStackedCount] = useState(0);
  const [lineWidth, setLineWidth] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const totalCycles = 4;
  const lastLineRef = useRef<HTMLParagraphElement>(null);
  const [lastLineGone, setLastLineGone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!visible || phase !== "cycling") return;
    let index = 0;
    const interval = setInterval(() => {
      setActiveImage(index);
      index++;
      if (index >= images.length) {
        index = 0;
        setCycle((prev) => {
          if (prev + 1 >= totalCycles) {
            clearInterval(interval);
            setTimeout(() => setPhase("stacking"), 300);
            return prev + 1;
          }
          return prev + 1;
        });
      }
    }, 200);
    return () => clearInterval(interval);
  }, [visible, phase, cycle]);

  useEffect(() => {
    if (phase !== "stacking") return;
    let count = 0;
    const interval = setInterval(() => {
      count++;
      setStackedCount(count);
      if (count >= images.length) {
        clearInterval(interval);
        setTimeout(() => setPhase("spread"), 600);
      }
    }, 150);
    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase !== "spread") return;
    const timer = setTimeout(() => setPhase("line"), 1200);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "line") return;
    const duration = 1200;
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      setLineWidth((1 - (1 - t) * (1 - t)) * 100);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [phase]);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Text fade on scroll
  const textFade = Math.min(scrollY / 200, 1);

  // Check if "Email arrives. Money lands." has left the viewport
  useEffect(() => {
    if (!lastLineRef.current) return;
    const onScroll = () => {
      const rect = lastLineRef.current?.getBoundingClientRect();
      if (rect && rect.bottom < 0) {
        setLastLineGone(true);
      } else {
        setLastLineGone(false);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Images don't move until left text is 40% scrolled
  // Left text section is ~1600px. 40% = 640px of scroll.
  const imageScrollStart = 640;
  // Each image is 112px apart. 0.8s per image at 60fps ≈ very slow scroll mapping.
  // Map scroll pixels to image movement very slowly
  const rawImageScroll = scrollY > imageScrollStart
    ? (scrollY - imageScrollStart) * 0.25
    : 0;

  // Image positions
  const imageGap = 112;
  const totalStackHeight = images.length * imageGap;
  const firstImageBase = -totalStackHeight / 2 + 48;

  // Count how many have been SCROLLED past the line (not initially above it)
  // Only count after images start moving (rawImageScroll > 0)
  let scannedCount = 0;
  if (rawImageScroll > 0) {
    // How many imageGaps worth of scroll have happened
    scannedCount = Math.min(
      images.length,
      Math.floor(rawImageScroll / imageGap) + 1
    );
  }

  const getOpacity = (i: number) => {
    if (phase === "spread" || phase === "line") return 1;
    if (phase === "stacking") return i < stackedCount ? 1 : 0;
    return i === activeImage ? 1 : 0;
  };

  return (
    <div className="min-h-[600vh]">
      {/* Fixed layer */}
      <div className="fixed inset-0 bg-[#f5f5f5] z-0">
        {/* Side texts */}
        <div className="absolute inset-0 flex items-center px-10 z-10 pointer-events-none">
          <span
            className="text-lg font-medium tracking-widest uppercase"
            style={{
              transform: `translateX(${-textFade * 300}px)`,
              opacity: 1 - textFade,
              transition: "opacity 0.3s",
            }}
          >
            UNCLAIMED INVOICES
          </span>
          <div className="flex-1" />
          <span
            className="text-lg font-medium tracking-widest uppercase"
            style={{
              transform: `translateX(${textFade * 300}px)`,
              opacity: 1 - textFade,
              transition: "opacity 0.3s",
            }}
          >
            SEAMLESS APPROVALS
          </span>
        </div>

        {/* Images — center column, repeating */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {images.map((src, i) => {
            let y: number;
            if (phase === "line") {
              // Wrap: after scrolling past all 8, loop back from bottom
              const loopHeight = images.length * imageGap;
              const rawY = firstImageBase + i * imageGap - rawImageScroll;
              y = ((rawY % loopHeight) + loopHeight) % loopHeight - loopHeight / 2;
            } else if (phase === "spread") {
              y = firstImageBase + i * imageGap;
            } else if (phase === "stacking" && i < stackedCount) {
              y = i * 12;
            } else {
              y = 0;
            }

            return (
              <div
                key={src}
                className="absolute w-24 h-24 rounded-xl overflow-hidden shadow-md"
                style={{
                  transform: `translateY(${y}px)`,
                  opacity: getOpacity(i),
                  zIndex: phase === "stacking" ? i : 0,
                  transition:
                    phase === "line"
                      ? "none"
                      : phase === "spread"
                        ? `all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 0.05}s`
                        : phase === "stacking"
                          ? "all 0.3s ease-out"
                          : "all 0.15s ease-out",
                }}
              >
                <Image src={src} alt="" fill className="object-cover" />
              </div>
            );
          })}
        </div>

        {/* Line */}
        {phase === "line" && (
          <div
            className="absolute top-1/2 left-1/2 h-[1px] bg-transparent z-20"
            style={{
              width: `${lineWidth}%`,
              transform: "translate(-50%, -50%)",
            }}
          />
        )}

        {/* Bottom text */}
        <p
          className="absolute bottom-8 left-0 right-0 text-center text-base text-black z-10"
          style={{
            transform: `translateY(${textFade * 200}px)`,
            opacity: 1 - textFade,
          }}
        >
          <em>all claimable onchain</em> without leaving your inbox. Powered by{" MagicBlock"}
        </p>

        {/* Right side — Radiohead + invoice as one paper block */}
        {phase === "line" && scrollY > (typeof window !== "undefined" ? window.innerHeight * 0.5 : 400) && (() => {
          const visibleItems = lineItems.slice(0, scannedCount);
          const runningTotal = visibleItems.reduce((sum, item) => sum + item.total, 0);
          const contentScroll = scannedCount > 6 ? (scannedCount - 6) * 56 : 0;
          const halfVh = typeof window !== "undefined" ? window.innerHeight * 0.5 : 400;
          const baseOffset = Math.max(0, scrollY - halfVh) * 0.6;
          return (
            <div
              className="absolute right-[4%] w-[38%] px-8 md:px-2 z-30"
              style={{
                top: `max(2rem, calc(50% - 1.5rem - ${baseOffset}px))`,
              }}
            >
              <div style={{
                transform: `translateY(-${contentScroll}px)`,
                transition: "transform 0.5s ease-out",
              }}>
              <p className="text-4xl md:text-6xl font-black tracking-tighter text-black mb-8">
                [RADIOHEAD INC]
              </p>

              {scannedCount > 0 && (
                <>
                  <span className="flex justify-between items-start mb-6">
                    <span>
                      <span className="text-base text-black/60 block">[{today}]</span>
                      <span className="text-base text-black/60 block">[Invox Reimbursement]</span>
                    </span>
                    <span>
                      <span className="text-base text-black/60 block">[#001845]</span>
                      <span className="text-base text-black/60 block">[Monthly Scan]</span>
                    </span>
                    <span className="text-5xl md:text-7xl font-black tracking-tighter text-black">INVOICE</span>
                  </span>

                  <span className="block border-t border-black/20 mt-4 pt-6">
                    {visibleItems.map((item, j) => (
                      <span key={j} className="flex justify-between text-lg text-black/70 mb-3">
                        <span className="flex-1">{item.name}</span>
                        <span className="w-16 text-right">{item.qty}</span>
                        <span className="w-24 text-right">{item.rate.toFixed(2)}</span>
                        <span className="w-28 text-right font-medium text-black">{item.total.toFixed(2)}</span>
                      </span>
                    ))}
                  </span>

                  <span className="flex justify-end mt-8 text-3xl font-black text-black">
                    ${runningTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>

                  {scannedCount >= 8 && (
                    <span
                      className="block mt-12 border-t border-black/20 pt-8"
                      style={{ animation: "stampPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both" }}
                    >
                      <span className="text-4xl md:text-5xl font-black tracking-tight text-black block mb-6">PAYMENT</span>
                      <span className="flex gap-6">
                        <span className="w-[45%]">
                          <span className="text-xs text-black/40 block mb-1">[INV NO. #001845]</span>
                          <span className="text-xs text-black/40 block mb-4">[REF: ZV20260402]</span>
                          <span className="flex gap-4 items-start">
                            <span className="flex-1">
                              <span className="text-sm font-medium text-black block mb-2">[STARKNET TRANSFER]</span>
                              <span className="text-xs text-black/50 block mb-1">[WALLET ADDRESS]</span>
                              <span className="text-xs text-black/50 block mb-1 font-mono">0x7dcf...0803</span>
                              <span className="text-xs text-black/50 block mb-4">[NETWORK: SEPOLIA]</span>
                              <span className="text-xs text-black/50 block mb-1">[TOKEN: USDC / SOL / ETH]</span>
                              <span className="text-xs text-black/50 block">[TERMS: INSTANT VIA STARKZAP]</span>
                            </span>
                            <span className="flex flex-col items-center">
                              <QRCodeSVG value="0x0660A457deD82CF20f49CB43f7EA6d2E9A058e046D06FB68efd88e9490F187dE" size={80} level="L" />
                              <span className="text-[9px] text-black/30 mt-1">SCAN QR TO PAY</span>
                            </span>
                          </span>
                        </span>
                        <span className="w-[45%]">
                          <span className="text-xs font-medium text-black block mb-2">TERMS & CONDITIONS:</span>
                          <span className="text-[10px] text-black/40 block leading-relaxed whitespace-pre-line">
                            1. Verified via ZK-Email DKIM proof. No email content exposed.{"\n"}2. Payment via MagicBlock with auto token swap.{"\n"}3. On-chain policy engine auto-approves under threshold.{"\n"}4. 8 Anchor programs on Solana Devnet.{"\n"}5. Final upon on-chain confirmation.{"\n"}6. Monthly caps enforced per-employee.{"\n"}7. Duplicate detection via DKIM hash.{"\n"}8. Employee confirms expense is legitimate.
                          </span>
                        </span>
                      </span>
                      <span className="flex justify-between items-end mt-8 pt-4 border-t border-black/10 text-[10px] text-black/30">
                        <span>[ZVOICE]<br />[STARKNET SEPOLIA]</span>
                        <span>[POWERED BY STARKZAP]</span>
                        <span>[ZK-EMAIL VERIFIED]</span>
                        <span>[CAIRO SMART CONTRACTS]</span>
                      </span>
                    </span>
                  )}

                  <div className="h-[200px]" />
                </>
              )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Left scrolling text */}
      <div className="relative z-30 pt-[100vh] pl-8 md:pl-16 max-w-[500px] pb-[200vh]">
        <p className="text-[clamp(1.4rem,3vw,2.2rem)] font-medium leading-[1.2] text-black tracking-tight mb-16">
          Every month, the same ritual. Employees dig through Gmail looking for
          receipts. Screenshot a Stripe charge. Forward a Notion invoice. Chase
          down that AWS bill buried in 47 unread emails.
        </p>

        <p className="text-[clamp(1.4rem,3vw,2.2rem)] font-medium leading-[1.2] text-black tracking-tight mb-16">
          Then accounting sends the follow-up. &ldquo;We&rsquo;re missing your
          October receipts.&rdquo; The spreadsheet grows. Reimbursements take weeks.
        </p>

        <p className="text-[clamp(1.4rem,3vw,2.2rem)] font-medium leading-[1.2] text-black tracking-tight mb-16">
          This is broken. Your inbox already has the proof. Cryptographically
          signed by the vendor&rsquo;s own mail server.
        </p>

        <p className="text-[clamp(1.4rem,3vw,2.2rem)] font-medium leading-[1.2] text-black tracking-tight mb-16">
          Invox reads the DKIM signature. Generates a zero-knowledge proof.
          Submits it onchain. The contract auto-approves. Payment hits your wallet.
        </p>

        <p className="text-[clamp(1.4rem,3vw,2.2rem)] font-medium leading-[1.2] text-black tracking-tight mb-16">
          No PDFs. No spreadsheets. No &ldquo;please resubmit.&rdquo;
        </p>

        <p ref={lastLineRef} className="text-[clamp(1.4rem,3vw,2.2rem)] font-medium leading-[1.2] text-black tracking-tight mb-20">
          Email arrives. Money lands.
        </p>

      </div>

      {/* Login boxes — fixed on left, appear after text ends */}
      {lastLineGone && (
        <>
          <div
            className="fixed left-8 md:left-16 bottom-8 z-40 flex flex-col gap-4 w-[35%] max-w-[500px]"
            style={{
              animation: "stampPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both",
            }}
          >
            <button
              onClick={async () => {
                if (!isConnected) {
                  openWalletModal(true); await new Promise(r => setTimeout(r, 2000));
                  // Small delay for wallet session to settle before navigating
                  setTimeout(() => router.push("/employee"), 500);
                } else {
                  router.push("/employee");
                }
              }}
              className="block w-full bg-black text-white p-10 hover:bg-black/90 transition-colors text-left"
            >
              <span className="text-5xl md:text-7xl font-black tracking-tighter block">LOGIN</span>
              <span className="text-lg text-white/50 mt-2 block">as Employee</span>
            </button>
            <button
              onClick={async () => {
                if (!isConnected) {
                  openWalletModal(true); await new Promise(r => setTimeout(r, 2000));
                  setTimeout(() => router.push("/admin/dashboard"), 500);
                } else {
                  router.push("/admin/dashboard");
                }
              }}
              className="block w-full bg-black text-white p-10 hover:bg-black/90 transition-colors text-left"
            >
              <span className="text-5xl md:text-7xl font-black tracking-tighter block">ADMIN</span>
              <span className="text-lg text-white/50 mt-2 block">Login</span>
            </button>
          </div>
          <div
            className="fixed left-0 top-0 bottom-0 w-[50%] z-30"
            style={{
              animation: "fadeIn 1.5s ease-out both",
            }}
          >
            <CipherText />
          </div>
        </>
      )}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes stampPop {
          0% { opacity: 0; transform: scale(2.5) rotate(-5deg); }
          60% { opacity: 1; transform: scale(0.95) rotate(0deg); }
          80% { transform: scale(1.03) rotate(0deg); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }
      `}</style>
    </div>
  );
}
