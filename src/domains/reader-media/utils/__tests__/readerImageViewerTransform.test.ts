import { describe, expect, it } from 'vitest';

import {
  buildAnchoredTransform,
  buildImageSwitchTransform,
  clampTranslate,
  computeTargetRect,
  getImageSwitchOffset,
  getMaxScale,
} from '../readerImageViewerTransform';

describe('readerImageViewerTransform', () => {
  it('computes a centered target rect inside the padded viewport', () => {
    const targetRect = computeTargetRect(
      { height: 800, width: 1200 },
      { height: 500, width: 1000 },
    );

    expect(targetRect.left).toBe(24);
    expect(targetRect.top).toBe(112);
    expect(targetRect.width).toBe(1152);
    expect(targetRect.height).toBe(576);
  });

  it('caps max scale at the safe upper bound', () => {
    const maxScale = getMaxScale(
      new DOMRect(0, 0, 500, 250),
      { height: 1000, width: 2000 },
    );

    expect(maxScale).toBe(4);
  });

  it('clamps translate to the current zoom bounds', () => {
    const clamped = clampTranslate(new DOMRect(0, 0, 400, 200), 2, 500, -150);

    expect(clamped).toEqual({ x: 200, y: -100 });
  });

  it('builds anchored transforms from the thumbnail origin rect', () => {
    const anchoredTransform = buildAnchoredTransform(
      new DOMRect(40, 80, 120, 90),
      new DOMRect(20, 40, 240, 180),
    );

    expect(anchoredTransform).toEqual({
      opacity: 1,
      scale: 1,
      scaleX: 0.5,
      scaleY: 0.5,
      x: -40,
      y: -5,
    });
  });

  it('uses the viewport width to derive slide offsets and transforms', () => {
    const slideOffset = getImageSwitchOffset({ height: 640, width: 400 });
    const transform = buildImageSwitchTransform({
      direction: 1,
      kind: 'slide',
      slideOffset,
      targetEntryId: 'entry',
    }, -1);

    expect(slideOffset).toBeCloseTo(232, 5);
    expect(transform.opacity).toBe(1);
    expect(transform.x).toBeCloseTo(-232, 5);
  });
});
