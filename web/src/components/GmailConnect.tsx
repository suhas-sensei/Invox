"use client";

import { useState } from "react";

interface GmailConnectProps {
  isConnected: boolean;
}

export function GmailConnect({ isConnected }: GmailConnectProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isConnected) {
    return (
      <div className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-2">
        <div className="w-2 h-2 rounded-full bg-green-400" />
        <span className="text-sm text-gray-300">Gmail Connected</span>
      </div>
    );
  }

  const handleConnect = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/gmail");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to connect Gmail");
        setIsLoading(false);
        return;
      }
      window.location.href = data.authUrl;
    } catch {
      setError("Network error");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="text-xs text-red-400 max-w-[200px] truncate" title={error}>
          {error}
        </span>
      )}
      <button
        onClick={handleConnect}
        disabled={isLoading}
        className="bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white font-medium px-6 py-2 rounded-lg transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 18h-2V9.25L12 13 6 9.25V18H4V6h1.2l6.8 4.25L18.8 6H20m0-2H4c-1.11 0-2 .89-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2z" />
        </svg>
        {isLoading ? "Redirecting..." : "Connect Gmail"}
      </button>
    </div>
  );
}
