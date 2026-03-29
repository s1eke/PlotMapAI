import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import ReaderTopBar from '../ReaderTopBar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function renderTopBar(overrides: Partial<React.ComponentProps<typeof ReaderTopBar>> = {}) {
  const onMobileBack = vi.fn();

  const renderResult = render(
    <MemoryRouter>
      <ReaderTopBar
        readerTheme="parchment"
        headerBgClassName="bg-[#f4ecd8]"
        textClassName="text-[#5b4636]"
        isChromeVisible
        isSidebarOpen={false}
        novelId={1}
        viewMode="original"
        onMobileBack={onMobileBack}
        onToggleSidebar={vi.fn()}
        onSetViewMode={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  );

  return { onMobileBack, ...renderResult };
}

describe('ReaderTopBar', () => {
  it('calls onMobileBack from the mobile back button', async () => {
    const user = userEvent.setup();
    const { onMobileBack } = renderTopBar();

    await user.click(screen.getByRole('button', { name: 'reader.exit' }));

    expect(onMobileBack).toHaveBeenCalledTimes(1);
  });

  it('keeps the desktop exit link pointing to the novel detail page', () => {
    renderTopBar();

    expect(screen.getByRole('link', { name: 'reader.exit' })).toHaveAttribute('href', '/novel/1');
  });

  it('disables pointer interaction when chrome is hidden', () => {
    const { container } = renderTopBar({ isChromeVisible: false });

    expect(container.querySelector('header')).toHaveClass('pointer-events-none');
  });

  it('uses the reader theme classes so the top bar feels unified with the page', () => {
    const { container } = renderTopBar();

    expect(container.querySelector('header')).toHaveClass('bg-[#f4ecd8]');
    expect(screen.getByRole('button', { name: 'reader.exit' })).toHaveClass('text-[#5b4636]');
  });
});
