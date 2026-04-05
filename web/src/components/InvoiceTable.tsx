"use client";

import type { Invoice } from "@/lib/types";
import { ProofStatus } from "./ProofStatus";

interface InvoiceTableProps {
  invoices: Invoice[];
  mode: "employee" | "admin";
  onApprove?: (invoice: Invoice) => void;
  onReject?: (invoice: Invoice) => void;
  isLoading?: boolean;
}

function formatAmount(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusBadge(status: Invoice["status"]) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-900/30 text-yellow-400",
    approved: "bg-blue-900/30 text-blue-400",
    auto_approved: "bg-cyan-900/30 text-cyan-400",
    paid: "bg-green-900/30 text-green-400",
    rejected: "bg-red-900/30 text-red-400",
  };

  return (
    <span className={`text-xs px-2 py-1 rounded capitalize ${styles[status]}`}>
      {status}
    </span>
  );
}

export function InvoiceTable({
  invoices,
  mode,
  onApprove,
  onReject,
  isLoading,
}: InvoiceTableProps) {
  if (isLoading) {
    return (
      <div className="text-center py-12 text-gray-500">
        Loading invoices...
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No invoices found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-gray-400 text-left">
            <th className="px-4 py-3 font-medium">ID</th>
            {mode === "admin" && (
              <th className="px-4 py-3 font-medium">Employee</th>
            )}
            <th className="px-4 py-3 font-medium">Vendor</th>
            <th className="px-4 py-3 font-medium">Amount</th>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Proof</th>
            <th className="px-4 py-3 font-medium">Status</th>
            {mode === "admin" && (
              <th className="px-4 py-3 font-medium">Actions</th>
            )}
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr
              key={inv.id}
              className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
            >
              <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                #{inv.id}
              </td>
              {mode === "admin" && (
                <td className="px-4 py-3 font-mono text-xs text-gray-300">
                  {inv.employee.slice(0, 6)}...{inv.employee.slice(-4)}
                </td>
              )}
              <td className="px-4 py-3 text-white">{inv.vendor}</td>
              <td className="px-4 py-3 text-white font-medium">
                {formatAmount(inv.amountCents)}
              </td>
              <td className="px-4 py-3 text-gray-400">
                {formatDate(inv.timestamp)}
              </td>
              <td className="px-4 py-3">
                <ProofStatus
                  status={inv.proofVerified ? "verified" : "none"}
                />
              </td>
              <td className="px-4 py-3">{statusBadge(inv.status)}</td>
              {mode === "admin" && (
                <td className="px-4 py-3">
                  {inv.status === "pending" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => onApprove?.(inv)}
                        className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded transition-colors"
                      >
                        Approve & Pay
                      </button>
                      <button
                        onClick={() => onReject?.(inv)}
                        className="text-xs bg-red-600/30 hover:bg-red-600/50 text-red-400 px-3 py-1 rounded transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                  {inv.status === "paid" && inv.paymentTx && (
                    <a
                      href={`https://solscan.io/tx/${inv.paymentTx}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:underline"
                    >
                      View Tx
                    </a>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
