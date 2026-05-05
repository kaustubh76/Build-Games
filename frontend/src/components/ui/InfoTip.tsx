'use client';

import React, { useState } from 'react';

/**
 * Minimal hover/focus tooltip. Renders a small `?` icon that shows
 * `children` on hover or keyboard focus. Accessible and self-contained.
 *
 * No external library — the project's `lucide-react` and `@radix-ui` aren't
 * pulled in by other components, and a 30-line hand-rolled tooltip is fine.
 */

interface InfoTipProps {
  children: React.ReactNode;
  className?: string;
  /** Tooltip side */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Override the trigger glyph */
  trigger?: React.ReactNode;
}

const sideClass: Record<NonNullable<InfoTipProps['side']>, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1',
};

export function InfoTip({ children, className = '', side = 'top', trigger }: InfoTipProps) {
  const [shown, setShown] = useState(false);
  return (
    <span
      className={`relative inline-flex items-center align-middle ${className}`}
      onMouseEnter={() => setShown(true)}
      onMouseLeave={() => setShown(false)}
      onFocus={() => setShown(true)}
      onBlur={() => setShown(false)}
    >
      <button
        type="button"
        aria-label="More info"
        className="w-4 h-4 flex items-center justify-center rounded-full bg-gray-700/70 hover:bg-gray-600 text-gray-300 text-[10px] font-bold cursor-help"
        tabIndex={0}
      >
        {trigger ?? '?'}
      </button>
      {shown && (
        <span
          role="tooltip"
          className={`absolute z-50 ${sideClass[side]} w-max max-w-[260px] px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-200 text-xs shadow-xl pointer-events-none`}
        >
          {children}
        </span>
      )}
    </span>
  );
}

export default InfoTip;
