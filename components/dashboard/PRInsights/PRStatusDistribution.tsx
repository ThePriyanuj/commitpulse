'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { GitPullRequest, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import prService, { PRStatusData } from '@/services/github/pr-service';

interface PRStatusDistributionProps {
  username: string;
  timeoutMs?: number;
}

export default function PRStatusDistribution({
  username,
  timeoutMs = 5000,
}: PRStatusDistributionProps) {
  const [data, setData] = useState<PRStatusData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    const sanitized = username.trim().toLowerCase();

    // Query local cache first
    const cached = prService.getCachedData(sanitized);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }

    try {
      // Race the fetch operation against a timeout
      const fetchPromise = prService.fetchPRStatusDistribution(sanitized);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out')), timeoutMs)
      );

      const result = await Promise.race([fetchPromise, timeoutPromise]);

      // Complete cache sync
      prService.setCachedData(sanitized, result);

      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [username, timeoutMs]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div
        data-testid="pending-overlay"
        className="flex items-center justify-center p-8 rounded-xl bg-white dark:bg-[#0a0a0a] border border-black/10 dark:border-[rgba(255,255,255,0.08)] min-h-[220px]"
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-blue-500" size={24} />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading PR distribution...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-testid="fallback-error"
        className="flex items-center justify-center p-8 rounded-xl bg-white dark:bg-[#0a0a0a] border border-red-500/20 min-h-[220px]"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertCircle className="text-red-500" size={24} />
          <p className="text-sm text-red-500 font-medium">{error}</p>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-3 py-1.5 mt-2 text-xs rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const total = data.open + data.closed + data.merged;
  const getPercentage = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6 rounded-xl bg-white dark:bg-[#0a0a0a] border border-black/10 dark:border-[rgba(255,255,255,0.08)] flex flex-col justify-between min-h-[220px]"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <GitPullRequest size={16} className="text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white tracking-tight">
            PR Status Distribution
          </h3>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">Total: {total}</span>
      </div>

      <div className="flex flex-col gap-4">
        {/* Progress bar stack */}
        <div className="flex h-3 w-full rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
          <div
            data-testid="pr-bar-merged"
            className="bg-purple-500 transition-all duration-300"
            style={{ width: `${getPercentage(data.merged)}%` }}
            title={`Merged: ${data.merged}`}
          />
          <div
            data-testid="pr-bar-open"
            className="bg-green-500 transition-all duration-300"
            style={{ width: `${getPercentage(data.open)}%` }}
            title={`Open: ${data.open}`}
          />
          <div
            data-testid="pr-bar-closed"
            className="bg-red-500 transition-all duration-300"
            style={{ width: `${getPercentage(data.closed)}%` }}
            title={`Closed: ${data.closed}`}
          />
        </div>

        {/* Legend */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-purple-500" />
              <span className="text-gray-600 dark:text-gray-400">Merged</span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-white">
              {data.merged} ({getPercentage(data.merged)}%)
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-gray-600 dark:text-gray-400">Open</span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-white">
              {data.open} ({getPercentage(data.open)}%)
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-gray-600 dark:text-gray-400">Closed</span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-white">
              {data.closed} ({getPercentage(data.closed)}%)
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
