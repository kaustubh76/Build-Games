'use client';

import React from 'react';
import { MarketSource } from '@/types/externalMarket';

interface MarketSourceBadgeProps {
  source: MarketSource;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

const sourceConfig: Record<MarketSource, {
  label: string;
  icon: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
}> = {
  [MarketSource.NATIVE]: {
    label: 'Native',
    icon: '🏆',
    bgColor: 'bg-red-500/20',
    textColor: 'text-red-400',
    borderColor: 'border-red-500/30',
  },
  [MarketSource.POLYMARKET]: {
    label: 'Polymarket',
    icon: '🔮',
    bgColor: 'bg-blue-500/20',
    textColor: 'text-blue-400',
    borderColor: 'border-blue-500/30',
  },
  [MarketSource.KALSHI]: {
    label: 'Kalshi',
    icon: '📊',
    bgColor: 'bg-green-500/20',
    textColor: 'text-green-400',
    borderColor: 'border-green-500/30',
  },
  [MarketSource.OPINION]: {
    label: 'Opinion',
    icon: '💬',
    bgColor: 'bg-yellow-500/20',
    textColor: 'text-yellow-400',
    borderColor: 'border-yellow-500/30',
  },
};

const sizeClasses = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-1 text-sm',
  lg: 'px-3 py-1.5 text-base',
};

export function MarketSourceBadge({
  source,
  size = 'sm',
  showIcon = true,
}: MarketSourceBadgeProps) {
  const config = sourceConfig[source];

  return (
    <span
      className={`
        inline-flex items-center gap-1 font-medium rounded-full border
        ${config.bgColor} ${config.textColor} ${config.borderColor}
        ${sizeClasses[size]}
      `}
    >
      {showIcon && <span>{config.icon}</span>}
      <span>{config.label}</span>
    </span>
  );
}

export default MarketSourceBadge;
