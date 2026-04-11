import { describe, expect, it } from 'vitest';

import { getPageTurnAnimation, getPageTurnSettleDuration } from '../pageTurnAnimations';

describe('pageTurnAnimations', () => {
  it('reveals the next page by sliding the current page away in cover mode', () => {
    const animation = getPageTurnAnimation('cover');

    expect(animation.initial({ direction: 'next' })).toMatchObject({ x: 0, zIndex: 1 });
    expect(animation.animate({ direction: 'next' })).toMatchObject({ x: 0, zIndex: 1 });
    expect(animation.exit({ direction: 'next' })).toMatchObject({ x: '-100%', zIndex: 2 });
  });

  it('pulls the previous page in from the left in cover mode', () => {
    const animation = getPageTurnAnimation('cover');

    expect(animation.initial({ direction: 'prev' })).toMatchObject({ x: '-100%', zIndex: 2 });
    expect(animation.animate({ direction: 'prev' })).toMatchObject({ x: 0, zIndex: 2 });
    expect(animation.exit({ direction: 'prev' })).toMatchObject({ x: 0, zIndex: 1 });
    expect(animation.transition.duration).toBe(1);
    expect(animation.transition.ease).toEqual([0.32, 0.72, 0.08, 1]);
  });

  it('builds slide animation targets in both directions', () => {
    const animation = getPageTurnAnimation('slide');

    expect(animation.initial({ direction: 'next' })).toMatchObject({ x: '100%', zIndex: 2 });
    expect(animation.animate({ direction: 'next' })).toMatchObject({ x: 0, zIndex: 2 });
    expect(animation.exit({ direction: 'next' })).toMatchObject({ x: '-100%', zIndex: 1 });
    expect(animation.initial({ direction: 'prev' })).toMatchObject({ x: '-100%', zIndex: 2 });
    expect(animation.exit({ direction: 'prev' })).toMatchObject({ x: '100%', zIndex: 1 });
    expect(animation.transition.duration).toBe(1);
    expect(animation.transition.ease).toEqual([0.32, 0.72, 0.08, 1]);
  });

  it('shortens drag settle duration based on the remaining distance', () => {
    expect(getPageTurnSettleDuration('cover', -540, -600, 600, 0)).toBeCloseTo(0.09);
    expect(getPageTurnSettleDuration('cover', -120, -600, 600, 0)).toBeCloseTo(0.144);
    expect(getPageTurnSettleDuration('slide', -120, -600, 600, 1200)).toBeLessThan(0.14);
  });

  it('keeps none mode static without positional transitions', () => {
    const animation = getPageTurnAnimation('none');

    expect(animation.initial({ direction: 'next' })).toEqual({ x: 0, zIndex: 1 });
    expect(animation.animate({ direction: 'next' })).toEqual({ x: 0, zIndex: 1 });
    expect(animation.exit({ direction: 'prev' })).toEqual({ x: 0, zIndex: 1 });
    expect(animation.transition.duration).toBe(0);
  });
});
