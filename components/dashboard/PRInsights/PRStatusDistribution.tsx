'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { ExternalLink } from 'lucide-react';
import type { PRInsightData } from '@/services/github/pr-insights';

type FilterState = 'MERGED' | 'OPEN' | 'CLOSED' | null;

const STATE_META: Record<string, { label: string; color: string }> = {
  MERGED: { label: 'Merged', color: '#10b981' },
  OPEN: { label: 'Open', color: '#3b82f6' },
  CLOSED: { label: 'Closed', color: '#ef4444' },
};

export default function PRStatusDistribution({ data }: { data: PRInsightData }) {
  const [activeFilter, setActiveFilter] = useState<FilterState>(null);

  const chartData = [
    { name: 'Merged', state: 'MERGED', value: data.mergedPRs, color: '#10b981' },
    { name: 'Open', state: 'OPEN', value: data.openPRs, color: '#3b82f6' },
    { name: 'Closed', state: 'CLOSED', value: data.closedPRs, color: '#ef4444' },
  ].filter((item) => item.value > 0);

  const activeMeta = activeFilter ? STATE_META[activeFilter] : null;
  const centerValue = activeMeta
    ? (chartData.find((d) => d.state === activeFilter)?.value ?? data.totalPRs)
    : data.totalPRs;
  const centerLabel = activeMeta ? activeMeta.label : 'Total';
  const centerColor = activeMeta ? activeMeta.color : undefined;

  const filteredPRs = activeFilter ? data.prs.filter((pr) => pr.state === activeFilter) : [];

  function handleClick(entry: { state: string }) {
    const clicked = entry.state as FilterState;
    setActiveFilter((prev) => (prev === clicked ? null : clicked));
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="bg-white dark:bg-zinc-900/50 border border-black/10 dark:border-white/10 rounded-3xl p-6 h-full flex flex-col"
    >
      <div className="mb-2">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Status Distribution</h2>
        <p className="text-sm text-gray-500">
          {activeFilter
            ? `Showing: ${activeMeta?.label} PRs — click again to reset`
            : 'Click a segment to explore'}
        </p>
      </div>

      <div className="flex-1 relative min-h-[250px] flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={90}
              paddingAngle={5}
              dataKey="value"
              stroke="none"
              animationBegin={400}
              animationDuration={1000}
              onClick={handleClick}
              style={{ cursor: 'pointer' }}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  opacity={activeFilter === null || activeFilter === entry.state ? 1 : 0.25}
                  style={{ transition: 'opacity 0.2s ease' }}
                  filter={
                    activeFilter === entry.state ? `drop-shadow(0 0 6px ${entry.color})` : undefined
                  }
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--recharts-tooltip-bg)',
                border: 'none',
                borderRadius: '12px',
                color: 'var(--recharts-tooltip-color)',
              }}
              itemStyle={{ color: 'var(--recharts-tooltip-color)' }}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <motion.span
            key={centerValue}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="text-3xl font-bold"
            style={{ color: centerColor }}
          >
            <span className={centerColor ? '' : 'text-gray-900 dark:text-white'}>
              {centerValue}
            </span>
          </motion.span>
          <motion.span
            key={centerLabel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="text-xs font-medium text-gray-500 uppercase tracking-widest"
          >
            {centerLabel}
          </motion.span>
        </div>
      </div>

      <div className="flex justify-center gap-4 mt-2">
        {chartData.map((item) => (
          <button
            key={item.name}
            onClick={() => handleClick(item)}
            className={`flex items-center gap-2 rounded-full px-2 py-1 transition-all duration-200 focus:outline-none ${
              activeFilter === item.state ? 'opacity-100' : 'opacity-60 hover:opacity-100'
            }`}
            aria-pressed={activeFilter === item.state}
            aria-label={`Filter by ${item.name} PRs`}
          >
            <div
              className="w-3 h-3 rounded-full"
              style={{
                backgroundColor: item.color,
                boxShadow: activeFilter === item.state ? `0 0 6px ${item.color}` : undefined,
              }}
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {item.name} <span className="text-gray-400">({item.value})</span>
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {activeFilter && filteredPRs.length > 0 && (
          <motion.div
            key={activeFilter}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden mt-4"
          >
            <div className="border-t border-black/10 dark:border-white/10 pt-4 flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
              {filteredPRs.map((pr, i) => (
                <motion.a
                  key={pr.url}
                  href={pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-start justify-between gap-2 rounded-xl px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                      {pr.title}
                    </span>
                    <span className="text-xs text-gray-400 truncate">{pr.repo}</span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 shrink-0 mt-0.5" />
                </motion.a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
