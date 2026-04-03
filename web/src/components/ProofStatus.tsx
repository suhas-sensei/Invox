"use client";

type ProofStatusType = "none" | "generating" | "verified" | "failed";

interface ProofStatusProps {
  status: ProofStatusType;
}

export function ProofStatus({ status }: ProofStatusProps) {
  switch (status) {
    case "none":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-black/30 bg-black/5 px-2 py-1 rounded">
          No Proof
        </span>
      );
    case "generating":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-black/50 bg-black/5 px-2 py-1 rounded">
          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Generating...
        </span>
      );
    case "verified":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-black/70 bg-black/5 px-2 py-1 rounded">
          <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          ZK Verified
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-black/40 bg-black/5 px-2 py-1 rounded">
          <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
          Failed
        </span>
      );
  }
}

export type { ProofStatusType };
