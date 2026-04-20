import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TxtCover from '../TxtCover';

describe('TxtCover', () => {
  it('renders title text', () => {
    render(<TxtCover title="My Novel" />);
    expect(screen.getByText('My Novel')).toBeInTheDocument();
  });

  it('applies custom width and height', () => {
    const { container } = render(<TxtCover title="Test" width="200px" height="300px" />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.width).toBe('200px');
    expect(div.style.height).toBe('300px');
  });
});
