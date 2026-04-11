import { describe, expect, it } from 'vitest';

import { viewportPointToGraphPoint } from '../characterGraphLayout';
import {
  canPanCharacterGraphCanvas,
  clampNodeToVisibleViewport,
  clampZoomOffsetForStage,
  getCharacterGraphStageSize,
  getResponsiveCharacterGraphStageHeight,
  getResponsiveMobileFitZoomState,
  zoomViewportAroundPoint,
} from '../characterGraphViewportTransform';

describe('characterGraphViewportTransform', () => {
  it('derives a responsive mobile stage height and keeps desktop height fixed', () => {
    expect(
      getResponsiveCharacterGraphStageHeight({ width: 375, height: 812 }, false),
    ).toBe(960);
    expect(
      getResponsiveCharacterGraphStageHeight({ width: 375, height: 812 }, true),
    ).toBeCloseTo(2400, 2);
    expect(getResponsiveCharacterGraphStageHeight({ width: 1440, height: 960 }, true)).toBe(960);
  });

  it('computes a fitted mobile zoom state for the current layout bounds', () => {
    const stageSize = getCharacterGraphStageSize(1280);
    const zoom = getResponsiveMobileFitZoomState([
      { x: 360, y: 320, radius: 48 },
      { x: 920, y: 640, radius: 52 },
    ], { width: 390, height: 844 }, stageSize);

    expect(zoom.scale).toBeGreaterThan(1);
    expect(zoom.offsetY).not.toBe(0);
  });

  it('clamps zoom offsets for both zoom-in and zoom-out states', () => {
    const stageSize = getCharacterGraphStageSize(1200);
    const zoomedIn = clampZoomOffsetForStage(stageSize, 1.8, 9999, -9999);
    const zoomedOut = clampZoomOffsetForStage(stageSize, 0.82, 9999, -9999);

    expect(zoomedIn.offsetX).toBeLessThanOrEqual(57.6);
    expect(zoomedIn.offsetY).toBeGreaterThanOrEqual(
      stageSize.height - stageSize.height * 1.8 - 57.6,
    );
    expect(zoomedOut.offsetX).toBeLessThan(300);
    expect(zoomedOut.offsetY).toBeGreaterThan(0);
  });

  it('keeps the graph point under the cursor stable while zooming', () => {
    const stageSize = getCharacterGraphStageSize(1200);
    const viewportPoint = { x: 720, y: 420 };
    const currentZoom = { scale: 1.12, offsetX: -88, offsetY: 34 };
    const graphPointBefore = viewportPointToGraphPoint(viewportPoint, currentZoom);
    const nextZoom = zoomViewportAroundPoint(viewportPoint, currentZoom, 1.9, stageSize);
    const graphPointAfter = viewportPointToGraphPoint(viewportPoint, nextZoom);

    expect(graphPointAfter.x).toBeCloseTo(graphPointBefore.x, 2);
    expect(graphPointAfter.y).toBeCloseTo(graphPointBefore.y, 2);
  });

  it('clamps dragged nodes to the currently visible viewport edges', () => {
    const stageSize = getCharacterGraphStageSize(1200);
    const zoom = { scale: 1.6, offsetX: -420, offsetY: -260 };
    const clamped = clampNodeToVisibleViewport({ x: 9999, y: 9999 }, 40, zoom, stageSize);
    const visibleBottomRight = viewportPointToGraphPoint(
      { x: stageSize.width, y: stageSize.height },
      zoom,
    );

    expect(clamped.x).toBeCloseTo(visibleBottomRight.x - 40, 1);
    expect(clamped.y).toBeCloseTo(visibleBottomRight.y - 40, 1);
  });

  it('treats mobile canvases as pannable even at the default transform', () => {
    expect(canPanCharacterGraphCanvas(true, { scale: 1, offsetX: 0, offsetY: 0 })).toBe(true);
    expect(canPanCharacterGraphCanvas(false, { scale: 1, offsetX: 0, offsetY: 0 })).toBe(false);
  });
});
