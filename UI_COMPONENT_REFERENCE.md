# UI Component Reference Guide
## Polymarket & Kalshi Integration - Visual Component Library

> **Quick Reference for UI Components**
> **Status**: ✅ Fully Implemented
> **Framework**: Next.js 15 + React 19 + TailwindCSS 4

---

## 🎯 Component Inventory

### 1. **ExternalMarketCard** Component
**File**: `frontend/src/components/markets/ExternalMarketCard.tsx`

#### Props Interface:
```typescript
interface ExternalMarketCardProps {
  market: UnifiedMarket;
  showSource?: boolean;          // Show source badge (default: true)
  compact?: boolean;              // Compact mode (default: false)
  showAgentTrading?: boolean;     // Show AI trade button (default: false)
  selectedAgentId?: bigint | null; // Selected AI agent ID
}
```

#### Usage Examples:

**Full Card (Default)**:
```tsx
<ExternalMarketCard
  market={marketData}
  showSource={true}
  showAgentTrading={true}
  selectedAgentId={agentId}
/>
```

**Compact Card**:
```tsx
<ExternalMarketCard
  market={marketData}
  compact={true}
/>
```

#### Visual Hierarchy:
```
┌─ Header Section ─────────────────────────────┐
│  [Source Badge] [Category] [Status Badge]    │
│  Market Question Title                       │
│  Brief description of market...              │
├─ Probability Section ────────────────────────┤
│  Yes 67.5%                    No 32.5%       │
│  [████████████░░░░░░] Animated Progress Bar  │
├─ Stats Section ──────────────────────────────┤
│  Volume: $2.5M    Liquidity: $450K          │
├─ Tags Section ───────────────────────────────┤
│  [Politics] [2026] [Election]               │
├─ Footer Section ─────────────────────────────┤
│  Ends in 45d 12h                            │
│  [View on Source] [AI Trade] [0G Verified]  │
└──────────────────────────────────────────────┘
```

---

### 2. **MarketSourceBadge** Component
**File**: `frontend/src/components/markets/MarketSourceBadge.tsx`

#### Props Interface:
```typescript
interface MarketSourceBadgeProps {
  source: MarketSource;
  size?: 'sm' | 'md' | 'lg';  // Default: 'md'
}
```

#### Badge Styles:

**Polymarket Badge**:
```html
<span class="inline-flex items-center gap-1 px-2 py-1
             text-purple-400 bg-purple-500/20
             rounded-full text-sm font-medium">
  🔮 Polymarket
</span>
```

**Kalshi Badge**:
```html
<span class="inline-flex items-center gap-1 px-2 py-1
             text-blue-400 bg-blue-500/20
             rounded-full text-sm font-medium">
  📈 Kalshi
</span>
```

#### Size Variations:
```typescript
// Small (sm)
text-xs px-1.5 py-0.5

// Medium (md) - Default
text-sm px-2 py-1

// Large (lg)
text-base px-3 py-1.5
```

---

### 3. **MarketSourceFilter** Component
**File**: `frontend/src/components/markets/MarketSourceFilter.tsx`

#### Props Interface:
```typescript
interface MarketSourceTabsProps {
  selected: MarketSource | 'all';
  onChange: (source: MarketSource | 'all') => void;
  counts?: {
    all?: number;
    polymarket?: number;
    kalshi?: number;
  };
}
```

#### Usage:
```tsx
<MarketSourceTabs
  selected={sourceFilter}
  onChange={setSourceFilter}
  counts={{
    all: 245,
    polymarket: 156,
    kalshi: 89,
  }}
/>
```

#### Visual Structure:
```
┌────────────────┬───────────────┬──────────────┐
│  All Markets   │  Polymarket   │    Kalshi    │
│     (245)      │     (156)     │     (89)     │
└────────────────┴───────────────┴──────────────┘
     [Active]       [Inactive]     [Inactive]
  border-b-2        gray-400        gray-400
  yellow-500        hover-fx        hover-fx
```

---

### 4. **CreateMirrorMarketModal** Component
**File**: `frontend/src/components/markets/CreateMirrorMarketModal.tsx`

#### Props Interface:
```typescript
interface CreateMirrorMarketModalProps {
  market: UnifiedMarket;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result: { txHash: string; mirrorKey: string }) => void;
}
```

#### Usage:
```tsx
const [showModal, setShowModal] = useState(false);

<CreateMirrorMarketModal
  market={selectedMarket}
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  onSuccess={(result) => {
    console.log('Mirror created:', result);
    setShowModal(false);
  }}
/>
```

#### Modal States Flow:
```
Input State
     ↓
Confirming State (Transaction pending)
     ↓
   ↙   ↘
Success   Error
State     State
   ↓       ↓
 Close   Retry → Input State
```

#### Form Fields:
```typescript
// Liquidity Input
type: number
min: 10
placeholder: "Enter amount"
quickSelect: [50, 100, 500]

// Validation
- Must be connected wallet
- Must be >= 10 CRwN
- Must have sufficient balance
```

---

### 5. **MirrorMarketTradePanel** Component
**File**: `frontend/src/components/markets/MirrorMarketTradePanel.tsx`

#### Component Structure:
```
Trade Panel
├─ Outcome Selection Tabs
│  ├─ YES Tab (with current price)
│  └─ NO Tab (with current price)
├─ Amount Input
│  ├─ Text input field
│  └─ Quick select buttons [25, 50, 100, MAX]
├─ Trade Preview
│  ├─ Expected outcome tokens
│  ├─ Price impact %
│  └─ Trading fee
└─ Execute Button
   └─ Dynamic text based on selection
```

#### State Management:
```typescript
const [selectedOutcome, setSelectedOutcome] = useState<'yes' | 'no'>('yes');
const [amount, setAmount] = useState('');
const [loading, setLoading] = useState(false);
```

---

### 6. **MirrorMarketPositions** Component
**File**: `frontend/src/components/markets/MirrorMarketPositions.tsx`

#### Display Structure:
```
Positions Container
├─ Market Header
│  └─ Market title + status
├─ YES Position Card
│  ├─ Token balance
│  ├─ Average buy price
│  ├─ Current value
│  ├─ P&L (with % and trend)
│  └─ [Sell] button
├─ NO Position Card
│  ├─ Token balance
│  ├─ Average buy price
│  ├─ Current value
│  ├─ P&L (with % and trend)
│  └─ [Sell] button
└─ Action Bar
   └─ [View Market] button
```

#### P&L Indicators:
```typescript
// Positive P&L
text-green-400
icon: 📈

// Negative P&L
text-red-400
icon: 📉

// Neutral
text-gray-400
icon: ➡️
```

---

## 🎨 Shared UI Patterns

### Status Badge Colors

```typescript
const STATUS_COLORS = {
  active: {
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    label: 'Active'
  },
  closed: {
    bg: 'bg-gray-500/20',
    text: 'text-gray-400',
    label: 'Closed'
  },
  resolved: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-400',
    label: 'Resolved'
  },
  expired: {
    bg: 'bg-yellow-500/20',
    text: 'text-yellow-400',
    label: 'Expired'
  },
  unopened: {
    bg: 'bg-purple-500/20',
    text: 'text-purple-400',
    label: 'Upcoming'
  }
};
```

### Button Variants

```typescript
// Primary Action (Create, Buy, Execute)
className="px-4 py-3 bg-yellow-500 hover:bg-yellow-400
          text-black font-medium rounded-lg
          transition-colors disabled:bg-gray-600"

// Secondary Action (Cancel, Close)
className="px-4 py-3 bg-gray-700 hover:bg-gray-600
          text-white rounded-lg transition-colors"

// Danger Action (Sell, Delete)
className="px-4 py-3 bg-red-600 hover:bg-red-500
          text-white rounded-lg transition-colors"

// AI/Special Action
className="px-4 py-3 bg-purple-600 hover:bg-purple-700
          text-white rounded-lg transition-colors"
```

### Loading Spinner

```tsx
<div className="w-16 h-16 border-4 border-yellow-500
                border-t-transparent rounded-full
                animate-spin" />
```

### Input Fields

```tsx
<input
  type="text"
  className="w-full px-4 py-3 bg-gray-800 border border-gray-600
             rounded-lg text-white placeholder-gray-400
             focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500
             outline-none"
  placeholder="Enter value..."
/>
```

---

## 📊 Data Formatting Utilities

### Volume Formatting
```typescript
function formatVolume(vol: string): string {
  const num = parseFloat(vol);
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

// Examples:
// 1500000 → "$1.5M"
// 45000 → "$45.0K"
// 500 → "$500"
```

### Time Remaining Formatting
```typescript
function getTimeRemaining(endDate: Date): string {
  const now = new Date();
  const diff = endDate.getTime() - now.getTime();

  if (diff <= 0) return 'Ended';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${minutes}m`;
  return `in ${minutes}m`;
}

// Examples:
// "in 45d 12h"
// "in 3h 24m"
// "in 12m"
// "Ended"
```

### Price Formatting
```typescript
function formatPrice(price: number): string {
  return `${price.toFixed(1)}%`;
}

// Example: 67.456 → "67.5%"
```

---

## 🔄 Animation Patterns

### Hover Transitions
```css
/* Card hover effect */
.market-card {
  @apply transition-all duration-200;
  @apply border-gray-700 hover:border-purple-500;
}

/* Text color transition */
.market-title {
  @apply transition-colors;
  @apply group-hover:text-purple-300;
}
```

### Loading States
```tsx
// Spinner animation
<div className="animate-spin" />

// Pulse animation for loading cards
<div className="animate-pulse bg-gray-800/50" />

// Slide-in animation for modals
<div className="animate-slide-in-up" />
```

### Progress Bar Animation
```tsx
<div
  className="bg-gradient-to-r from-green-500 to-green-400
             transition-all duration-500"
  style={{ width: `${yesPercentage}%` }}
/>
```

---

## 📱 Responsive Patterns

### Grid Layouts
```tsx
// Markets grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {markets.map(market => <ExternalMarketCard key={market.id} market={market} />)}
</div>

// Stats cards
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
  {stats.map(stat => <StatCard key={stat.label} {...stat} />)}
</div>
```

### Flexible Layouts
```tsx
// Header with responsive flex
<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
  <div>Title</div>
  <div>Actions</div>
</div>

// Filter row
<div className="flex flex-wrap items-center gap-4">
  <SearchInput />
  <CategoryFilter />
  <StatusFilter />
  <SortOptions />
</div>
```

### Mobile-First Modals
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div className="relative w-full max-w-lg mx-auto bg-gray-900 rounded-xl">
    {/* Modal content */}
  </div>
</div>
```

---

## 🎯 Accessibility Features

### ARIA Labels
```tsx
// Buttons
<button aria-label="Close modal" onClick={onClose}>
  <CloseIcon />
</button>

// Links
<a
  href={market.sourceUrl}
  target="_blank"
  rel="noopener noreferrer"
  aria-label={`View ${market.question} on ${sourceName}`}
>
  View on {sourceName}
</a>
```

### Keyboard Navigation
```tsx
// Modal escape key handler
useEffect(() => {
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  window.addEventListener('keydown', handleEscape);
  return () => window.removeEventListener('keydown', handleEscape);
}, [onClose]);
```

### Focus Management
```tsx
// Auto-focus on modal open
const inputRef = useRef<HTMLInputElement>(null);

useEffect(() => {
  if (isOpen) {
    inputRef.current?.focus();
  }
}, [isOpen]);
```

---

## 🧩 Composition Patterns

### Market Card with Multiple Features
```tsx
<ExternalMarketCard
  market={market}
  showSource={true}              // Show Polymarket/Kalshi badge
  compact={false}                // Full card layout
  showAgentTrading={true}        // Enable AI trade button
  selectedAgentId={agentId}      // Pass selected agent
/>
```

### Modal with Custom Success Handler
```tsx
<CreateMirrorMarketModal
  market={selectedMarket}
  isOpen={modalOpen}
  onClose={() => setModalOpen(false)}
  onSuccess={(result) => {
    // Custom logic on success
    toast.success('Mirror created!');
    router.push(`/markets/${result.mirrorKey}`);
    setModalOpen(false);
  }}
/>
```

### Filtered Market List
```tsx
const filteredMarkets = useMemo(() =>
  markets.filter(m => {
    if (sourceFilter !== 'all' && m.source !== sourceFilter) return false;
    if (searchQuery && !m.question.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (statusFilter && m.status !== statusFilter) return false;
    return true;
  }),
  [markets, sourceFilter, searchQuery, statusFilter]
);

return (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {filteredMarkets.map(market => (
      <ExternalMarketCard key={market.id} market={market} />
    ))}
  </div>
);
```

---

## 🎨 Theme Customization

### Tailwind Config Extensions
```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        polymarket: {
          DEFAULT: '#a855f7', // purple-500
          light: '#c084fc',   // purple-400
          dark: '#9333ea',    // purple-600
        },
        kalshi: {
          DEFAULT: '#3b82f6', // blue-500
          light: '#60a5fa',   // blue-400
          dark: '#2563eb',    // blue-600
        }
      },
      animation: {
        'slide-in-up': 'slideInUp 0.3s ease-out',
      },
      keyframes: {
        slideInUp: {
          '0%': { transform: 'translateY(10px)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        }
      }
    }
  }
}
```

---

## 📚 Code Examples

### Complete Market Card Implementation
```tsx
import { ExternalMarketCard } from '@/components/markets/ExternalMarketCard';
import { useExternalMarkets } from '@/hooks/useExternalMarkets';

export default function MarketsPage() {
  const { markets, loading } = useExternalMarkets();

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-white mb-8">
        External Markets
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {markets.map(market => (
          <ExternalMarketCard
            key={market.id}
            market={market}
            showSource={true}
          />
        ))}
      </div>
    </div>
  );
}
```

### Modal Trigger Implementation
```tsx
import { useState } from 'react';
import { CreateMirrorMarketModal } from '@/components/markets/CreateMirrorMarketModal';

export function MarketDetailPage({ market }) {
  const [showMirrorModal, setShowMirrorModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowMirrorModal(true)}
        className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400
                   text-black font-medium rounded-lg transition-colors"
      >
        Create Mirror Market
      </button>

      <CreateMirrorMarketModal
        market={market}
        isOpen={showMirrorModal}
        onClose={() => setShowMirrorModal(false)}
        onSuccess={(result) => {
          console.log('Mirror created:', result.txHash);
          setShowMirrorModal(false);
        }}
      />
    </>
  );
}
```

---

## ✅ Component Checklist

### Before Using Components:
- [ ] Import required types from `@/types/externalMarket`
- [ ] Setup wagmi hooks if wallet interaction needed
- [ ] Handle loading and error states
- [ ] Test responsive behavior on mobile
- [ ] Verify accessibility (keyboard nav, ARIA)
- [ ] Check dark theme compatibility
- [ ] Test with different data scenarios (empty, error, success)

### Performance Optimization:
- [ ] Use `React.memo` for expensive components
- [ ] Implement `useMemo` for filtered lists
- [ ] Debounce search inputs
- [ ] Lazy load modals
- [ ] Optimize re-renders with proper keys

---

**Document Version**: 1.0.0
**Created**: 2026-01-26
**Status**: ✅ Production Ready
**Maintainer**: Warriors AI-rena Development Team
