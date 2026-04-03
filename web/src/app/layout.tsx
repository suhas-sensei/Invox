import type { Metadata } from "next";
import { SolanaProvider } from "@/components/SolanaProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Invox - Privacy-Preserving Invoice Reimbursement on Solana",
  description:
    "ZK-powered corporate invoice verification and reimbursement on Solana with MagicBlock",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body
        className="min-h-full flex flex-col"
        style={{ fontFamily: "'SF Pro Display', 'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif" }}
      >
        <SolanaProvider>
          {children}
        </SolanaProvider>
      </body>
    </html>
  );
}
