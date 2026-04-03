"use client";

import { useState, useCallback, useRef } from "react";
import type { Invoice } from "@/lib/types";

interface UseInvoicesReturn {
  invoices: Invoice[];
  isLoading: boolean;
  error: string | null;
  refresh: (employee?: string) => Promise<void>;
}

export function useInvoices(): UseInvoicesReturn {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  const refresh = useCallback(async (employee?: string) => {
    if (!hasFetched.current) setIsLoading(true);
    setError(null);

    try {
      const params = employee ? `?employee=${employee}` : "";
      const res = await fetch(`/api/invoice/list${params}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch invoices");
      }

      setInvoices(data.invoices);
      hasFetched.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { invoices, isLoading, error, refresh };
}
