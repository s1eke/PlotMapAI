import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TxtCover from '../TxtCover';

describe('TxtCover', () => {
  it('renders title text', () => {
    render(<TxtCover title="My Novel" />);
    expect(screen.getByText('My Novel')).toBeInTheDocument();
  });

  it('renders TXT badge', () => {
    render(<TxtCover title="Test" />);
    expect(screen.getByText('TXT')).toBeInTheDocument();
  });

  it('applies custom width and height', () => {
    const { container } = render(<TxtCover title="Test" width="200px" height="300px" />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.width).toBe('200px');
    expect(div.style.height).toBe('300px');
  });

  it('generates different gradients for different titles', () => {
    const { container: c1 } = render(<TxtCover title="Alpha" />);
    const { container: c2 } = render(<TxtCover title="Beta" />);
    const bg1 = (c1.firstElementChild as HTMLElement).style.background;
    const bg2 = (c2.firstElementChild as HTMLElement).style.background;
    expect(bg1).not.toBe(bg2);
  });

  it('uses default width and height when not specified', () => {
    const { container } = render(<TxtCover title="Test" />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.width).toBe('100%');
    expect(div.style.height).toBe('100%');
  });

  it('lets the cover title inherit the global sans font stack', () => {
    render(<TxtCover title="My Novel" />);
    expect(screen.getByRole('heading', { level: 3 })).not.toHaveClass('font-serif');
  });
});
