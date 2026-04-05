"use client";

import { useState } from "react";
import type { Invoice } from "@/lib/types";

interface PaymentModalProps {
  invoice: Invoice;
  adminAddress: string;
  onClose: () => void;
  onSuccess: () => void;
}

const TOKEN_OPTIONS = [
  { label: "USDC", value: "" },
  {
    label: "SOL",
    value:
      "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  },
  {
    label: "ETH",
    value:
      "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  },
];

export function PaymentModal({
  invoice,
  adminAddress,
  onClose,
  onSuccess,
}: PaymentModalProps) {
  const [preferredToken, setPreferredToken] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    paymentTx?: string;
    error?: string;
  } | null>(null);

  const handleApprove = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch("/api/invoice/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id,
          employeeAddress: invoice.employee,
          amountCents: invoice.amountCents,
          preferredToken: preferredToken || undefined,
          adminAddress,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult({ success: false, error: data.error });
      } else {
        setResult({ success: true, paymentTx: data.paymentTx });
        setTimeout(onSuccess, 2000);
      }
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-white mb-4">
          Approve & Pay Invoice
        </h3>

        <div className="space-y-3 mb-6">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Vendor</span>
            <span className="text-white">{invoice.vendor}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Amount</span>
            <span className="text-white font-medium">
              ${(invoice.amountCents / 100).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Employee</span>
            <span className="text-white font-mono text-xs">
              {invoice.employee.slice(0, 10)}...{invoice.employee.slice(-6)}
            </span>
          </div>

          <div className="pt-2">
            <label className="text-sm text-gray-400 block mb-1">
              Pay in token
            </label>
            <select
              value={preferredToken}
              onChange={(e) => setPreferredToken(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              {TOKEN_OPTIONS.map((t) => (
                <option key={t.label} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {result && (
          <div
            className={`text-sm p-3 rounded-lg mb-4 ${
              result.success
                ? "bg-green-900/30 text-green-400"
                : "bg-red-900/30 text-red-400"
            }`}
          >
            {result.success ? (
              <>
                Payment sent!{" "}
                <a
                  href={`https://solscan.io/tx/${result.paymentTx}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  View transaction
                </a>
              </>
            ) : (
              result.error
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="flex-1 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApprove}
            disabled={isProcessing || result?.success === true}
            className="flex-1 text-sm text-white bg-green-600 hover:bg-green-700 disabled:bg-green-800 px-4 py-2 rounded-lg transition-colors"
          >
            {isProcessing ? "Processing..." : "Confirm & Pay"}
          </button>
        </div>
      </div>
    </div>
  );
}
