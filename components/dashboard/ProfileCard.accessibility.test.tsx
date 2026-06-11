import type { ComponentProps, ImgHTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ProfileCard from './ProfileCard';
import VisualizationTooltip from './VisualizationTooltip';
import type { DashboardExportData, UserProfile } from '@/types/dashboard';

type MotionProps = {
  initial?: unknown;
  animate?: unknown;
  exit?: unknown;
  transition?: unknown;
  whileHover?: unknown;
  whileTap?: unknown;
};

type MotionDivProps = ComponentProps<'div'> & MotionProps & { children?: ReactNode };
type MotionButtonProps = ComponentProps<'button'> & MotionProps & { children?: ReactNode };

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} />
  ),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: MotionDivProps) => <div {...props}>{children}</div>,
    button: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      whileHover: _whileHover,
      whileTap: _whileTap,
      ...props
    }: MotionButtonProps) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('react-qr-code', () => ({
  default: ({ value }: { value: string }) => (
    <svg aria-hidden="true" data-testid="qr-code" data-value={value} />
  ),
}));

vi.mock('@/hooks/useShareActions', () => ({
  useShareActions: () => ({
    states: {},
    handleTwitter: vi.fn(),
    handleLinkedIn: vi.fn(),
    handleReddit: vi.fn(),
    handleDownloadPNG: vi.fn(),
    handleDownloadWEBP: vi.fn(),
    handleDownloadSVG: vi.fn(),
    handleCopyMarkdown: vi.fn(),
    handleDownloadJSON: vi.fn(),
    handleNativeShare: vi.fn(),
  }),
}));

const mockUser: UserProfile = {
  name: 'Jane Doe',
  username: 'janedoe',
  bio: 'Fullstack Engineer and open source maintainer',
  location: 'San Francisco, CA',
  joinedDate: 'Joined Oct 2021',
  developerScore: 88,
  avatarUrl: 'https://example.com/jane-avatar.png',
  isPro: true,
  stats: {
    repositories: 45,
    stars: 230,
    followers: 1200,
    following: 150,
  },
};

const mockExportData: DashboardExportData = {
  stats: {
    currentStreak: 8,
    peakStreak: 45,
    totalContributions: 382,
  },
  languages: [
    { name: 'TypeScript', color: '#3178c6', percentage: 70 },
    { name: 'CSS', color: '#563d7c', percentage: 30 },
  ],
  activity: [],
};

function renderProfileCard() {
  return render(
    <ProfileCard
      user={mockUser}
      exportData={mockExportData}
      badges={['Top Contributor', 'Fast Responder']}
    />
  );
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

describe('ProfileCard - Accessibility Standards & Screen Reader Aria Compliance', () => {
  it('uses accessible label coordinates for the avatar, share button, and share dialog', () => {
    renderProfileCard();

    expect(screen.getByRole('img', { name: 'Jane Doe' })).toHaveAttribute(
      'src',
      'https://example.com/jane-avatar.png?s=120'
    );

    fireEvent.click(screen.getByRole('button', { name: /share your pulse/i }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'share-sheet-title');
    expect(screen.getByText('janedoe')).toHaveAttribute('id', 'share-sheet-title');
    expect(screen.getByRole('button', { name: /close share panel/i })).toHaveAttribute(
      'aria-label',
      'Close share panel'
    );
  });

  it('keeps focusable button controls keyboard reachable without suppressing visible outlines', () => {
    renderProfileCard();

    const shareButton = screen.getByRole('button', { name: /share your pulse/i });
    shareButton.focus();

    expect(document.activeElement).toBe(shareButton);
    expect(shareButton.className).not.toMatch(/(?:^|\s)(?:focus:)?outline-none(?:\s|$)/);

    fireEvent.click(shareButton);

    const closeButton = screen.getByRole('button', { name: /close share panel/i });
    closeButton.focus();

    expect(document.activeElement).toBe(closeButton);
    expect(closeButton.className).not.toMatch(/(?:^|\s)(?:focus:)?outline-none(?:\s|$)/);
  });

  it('announces tooltip labels through tooltip semantics and readable text content', () => {
    render(
      <div>
        <button aria-describedby="profile-score-tooltip">Developer Score</button>
        <VisualizationTooltip title="Developer Score" x={120} y={80}>
          <span id="profile-score-tooltip">Developer score is 88 out of 100.</span>
        </VisualizationTooltip>
      </div>
    );

    const trigger = screen.getByRole('button', { name: /developer score/i });
    const tooltip = screen.getByRole('tooltip');

    expect(trigger).toHaveAccessibleDescription('Developer score is 88 out of 100.');
    expect(tooltip).toHaveTextContent('Developer Score');
    expect(tooltip).toHaveTextContent('Developer score is 88 out of 100.');
  });

  it('preserves normal tab ordering and wraps keyboard focus inside the share dialog', () => {
    renderProfileCard();

    fireEvent.click(screen.getByRole('button', { name: /share your pulse/i }));

    const dialog = screen.getByRole('dialog');
    const focusableElements = getFocusableElements(dialog);
    const closeButton = screen.getByRole('button', { name: /close share panel/i });
    const copyImageButton = screen.getByRole('button', { name: /copy image/i });
    const saveFileButton = screen.getByRole('button', { name: /save file/i });
    const urlInput = screen.getByDisplayValue('https://commitpulse.vercel.app/dashboard/janedoe');

    expect(focusableElements[0]).toBe(closeButton);
    expect(focusableElements[1]).toBe(copyImageButton);
    expect(focusableElements[2]).toBe(saveFileButton);
    expect(focusableElements[3]).toBe(urlInput);
    expect(focusableElements.length).toBeGreaterThan(4);

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    lastElement.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(firstElement);

    firstElement.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(lastElement);
  });

  it('renders headings in logical hierarchical order without skipped levels', () => {
    const { container } = renderProfileCard();

    const headings = Array.from(
      container.querySelectorAll<HTMLHeadingElement>('h1, h2, h3, h4, h5, h6')
    );
    const levels = headings.map((heading) => Number(heading.tagName.slice(1)));

    expect(screen.getByRole('heading', { name: 'Jane Doe', level: 2 })).toBeInTheDocument();
    expect(levels).toEqual([2]);

    for (let index = 0; index < levels.length - 1; index += 1) {
      expect(levels[index + 1] - levels[index]).toBeLessThanOrEqual(1);
    }
  });
});
