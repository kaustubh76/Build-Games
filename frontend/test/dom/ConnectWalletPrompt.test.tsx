// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectWalletPrompt } from '@/components/common/ConnectWalletPrompt';

describe('<ConnectWalletPrompt>', () => {
  it('renders default title with description', () => {
    render(<ConnectWalletPrompt description="Connect to view your portfolio." />);
    expect(screen.getByText(/connect wallet/i)).toBeInTheDocument();
    expect(screen.getByText('Connect to view your portfolio.')).toBeInTheDocument();
  });

  it('honours a custom title and icon', () => {
    render(
      <ConnectWalletPrompt
        icon="⚔️"
        title="JOIN THE ARENA"
        description="Sign in to start battling."
      />
    );
    expect(screen.getByText('JOIN THE ARENA')).toBeInTheDocument();
    // Icon emoji should be rendered (visible in the DOM as text)
    expect(screen.getByText('⚔️')).toBeInTheDocument();
  });

  it('renders the optional hint when provided', () => {
    render(
      <ConnectWalletPrompt
        description="Connect."
        hint="Use the Connect button in the header."
      />
    );
    expect(screen.getByText(/Use the Connect button/)).toBeInTheDocument();
  });

  it('omits the hint paragraph when not provided', () => {
    const { container } = render(
      <ConnectWalletPrompt description="No hint here." />
    );
    // Two <p> elements would mean both description + hint; we want one.
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(1);
  });
});
