import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import CharacterShareChart from '../CharacterShareChart';

describe('CharacterShareChart', () => {
  it('renders the empty state when no character data is available', () => {
    render(
      <CharacterShareChart
        characters={[]}
        emptyLabel="No character data"
        roleFallback="Unknown role"
        ariaLabel="Character share chart"
      />,
    );

    expect(screen.getByText('No character data')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Character share chart' })).not.toBeInTheDocument();
  });

  it('renders an accessible chart with formatted percentages and role fallback', () => {
    render(
      <CharacterShareChart
        characters={[
          { name: 'Alice', role: '', sharePercent: 12 },
          { name: 'Bob', role: 'Lead', sharePercent: 12.5 },
        ]}
        emptyLabel="No character data"
        roleFallback="Unknown role"
        ariaLabel="Character share chart"
      />,
    );

    expect(screen.getByRole('img', { name: 'Character share chart' })).toBeInTheDocument();
    expect(screen.getByText('12%')).toBeInTheDocument();
    expect(screen.getByText('12.5%')).toBeInTheDocument();
    expect(screen.getByText('Unknown role')).toBeInTheDocument();
    expect(screen.getByText('Lead')).toBeInTheDocument();
  });

  it('truncates long character names and role labels', () => {
    render(
      <CharacterShareChart
        characters={[
          {
            name: 'VeryLongName',
            role: 'Mysterious Stranger',
            sharePercent: 40,
          },
        ]}
        emptyLabel="No character data"
        roleFallback="Unknown role"
        ariaLabel="Character share chart"
      />,
    );

    expect(screen.getByText('VeryLong…')).toBeInTheDocument();
    expect(screen.getByText('Mysterious Str…')).toBeInTheDocument();
  });

  it('generates unique SVG ids for multiple chart instances', () => {
    const { container } = render(
      <>
        <CharacterShareChart
          characters={[{ name: 'Alice', role: 'Lead', sharePercent: 30 }]}
          emptyLabel="No character data"
          roleFallback="Unknown role"
          ariaLabel="Chart one"
        />
        <CharacterShareChart
          characters={[{ name: 'Bob', role: 'Support', sharePercent: 20 }]}
          emptyLabel="No character data"
          roleFallback="Unknown role"
          ariaLabel="Chart two"
        />
      </>,
    );

    const ids = Array.from(
      container.querySelectorAll('linearGradient[id], filter[id]'),
      (element) => element.getAttribute('id'),
    );

    expect(new Set(ids).size).toBe(ids.length);
  });
});
