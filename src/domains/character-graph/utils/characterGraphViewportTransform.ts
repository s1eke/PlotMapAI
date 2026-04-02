import {
  CANVAS_PADDING,
  clamp,
  DEFAULT_ZOOM_STATE,
  MAX_ZOOM_SCALE,
  MIN_ZOOM_SCALE,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  viewportPointToGraphPoint,
  type LayoutNode,
  type ZoomState,
} from './characterGraphLayout';

export interface CharacterGraphViewportSize {
  width: number;
  height: number;
}

export interface CharacterGraphStageSize {
  width: number;
  height: number;
}

export const DEFAULT_CHARACTER_GRAPH_VIEWPORT_SIZE: CharacterGraphViewportSize = {
  width: STAGE_WIDTH,
  height: STAGE_HEIGHT,
};

export const MAX_MOBILE_STAGE_HEIGHT = 2400;

export function getResponsiveCharacterGraphStageHeight(
  viewportSize: CharacterGraphViewportSize,
  isMobile: boolean,
): number {
  if (!isMobile) {
    return STAGE_HEIGHT;
  }

  const rawHeight = STAGE_WIDTH * (viewportSize.height / Math.max(1, viewportSize.width));
  return Number(clamp(rawHeight, STAGE_HEIGHT, MAX_MOBILE_STAGE_HEIGHT).toFixed(2));
}

export function getCharacterGraphStageSize(stageHeight: number): CharacterGraphStageSize {
  return {
    width: STAGE_WIDTH,
    height: stageHeight,
  };
}

export function clampZoomOffsetForStage(
  stageSize: CharacterGraphStageSize,
  scale: number,
  offsetX: number,
  offsetY: number,
): ZoomState {
  const slackX = CANVAS_PADDING * 0.6;
  const slackY = CANVAS_PADDING * 0.6;

  if (scale >= 1) {
    return {
      scale,
      offsetX: Number(
        clamp(offsetX, stageSize.width - stageSize.width * scale - slackX, slackX).toFixed(2),
      ),
      offsetY: Number(
        clamp(offsetY, stageSize.height - stageSize.height * scale - slackY, slackY).toFixed(2),
      ),
    };
  }

  const centeredOffsetX = (stageSize.width - stageSize.width * scale) / 2;
  const centeredOffsetY = (stageSize.height - stageSize.height * scale) / 2;
  return {
    scale,
    offsetX: Number(clamp(offsetX, centeredOffsetX - slackX, centeredOffsetX + slackX).toFixed(2)),
    offsetY: Number(clamp(offsetY, centeredOffsetY - slackY, centeredOffsetY + slackY).toFixed(2)),
  };
}

export function getResponsiveMobileFitZoomState(
  nodes: Array<Pick<LayoutNode, 'x' | 'y' | 'radius'>>,
  viewportSize: CharacterGraphViewportSize,
  stageSize: CharacterGraphStageSize,
): ZoomState {
  const horizontalPaddingPx = Math.min(28, Math.max(18, viewportSize.width * 0.05));
  const topPaddingPx = Math.min(44, Math.max(20, viewportSize.height * 0.045));
  const bottomPaddingPx = Math.min(120, Math.max(72, viewportSize.height * 0.14));

  if (nodes.length === 0) {
    return DEFAULT_ZOOM_STATE;
  }

  const minX = Math.min(...nodes.map((node) => node.x - node.radius));
  const maxX = Math.max(...nodes.map((node) => node.x + node.radius));
  const minY = Math.min(...nodes.map((node) => node.y - node.radius));
  const maxY = Math.max(...nodes.map((node) => node.y + node.radius));
  const boundsWidth = Math.max(1, maxX - minX);
  const boundsHeight = Math.max(1, maxY - minY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const paddingX = (horizontalPaddingPx / Math.max(1, viewportSize.width)) * stageSize.width;
  const paddingTop = (topPaddingPx / Math.max(1, viewportSize.height)) * stageSize.height;
  const paddingBottom = (bottomPaddingPx / Math.max(1, viewportSize.height)) * stageSize.height;
  const availableWidth = Math.max(1, stageSize.width - paddingX * 2);
  const availableHeight = Math.max(1, stageSize.height - paddingTop - paddingBottom);
  const scale = clamp(
    Number(Math.min(availableWidth / boundsWidth, availableHeight / boundsHeight).toFixed(4)),
    1.02,
    2.12,
  );
  const targetCenterY = paddingTop + availableHeight * 0.48;

  return clampZoomOffsetForStage(
    stageSize,
    scale,
    stageSize.width / 2 - centerX * scale,
    targetCenterY - centerY * scale,
  );
}

export function zoomViewportAroundPoint(
  viewportPoint: { x: number; y: number },
  currentZoom: ZoomState,
  nextScale: number,
  stageSize: CharacterGraphStageSize,
): ZoomState {
  const clampedScale = clamp(Number(nextScale.toFixed(4)), MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);
  const graphPoint = viewportPointToGraphPoint(viewportPoint, currentZoom);
  return clampZoomOffsetForStage(
    stageSize,
    clampedScale,
    viewportPoint.x - graphPoint.x * clampedScale,
    viewportPoint.y - graphPoint.y * clampedScale,
  );
}

export function panCharacterGraphViewport(
  stageSize: CharacterGraphStageSize,
  scale: number,
  originOffsetX: number,
  originOffsetY: number,
  deltaX: number,
  deltaY: number,
): ZoomState {
  return clampZoomOffsetForStage(
    stageSize,
    scale,
    originOffsetX + deltaX,
    originOffsetY + deltaY,
  );
}

export function clampNodeToVisibleViewport(
  point: { x: number; y: number },
  radius: number,
  zoomState: ZoomState,
  stageSize: CharacterGraphStageSize,
): { x: number; y: number } {
  const visibleTopLeft = viewportPointToGraphPoint({ x: 0, y: 0 }, zoomState);
  const visibleBottomRight = viewportPointToGraphPoint(
    { x: stageSize.width, y: stageSize.height },
    zoomState,
  );
  const minX = Math.max(
    CANVAS_PADDING * 0.35 + radius,
    Math.min(visibleTopLeft.x, visibleBottomRight.x) + radius,
  );
  const maxX = Math.min(
    STAGE_WIDTH - CANVAS_PADDING * 0.35 - radius,
    Math.max(visibleTopLeft.x, visibleBottomRight.x) - radius,
  );
  const minY = Math.max(
    CANVAS_PADDING * 0.35 + radius,
    Math.min(visibleTopLeft.y, visibleBottomRight.y) + radius,
  );
  const maxY = Math.min(
    stageSize.height - CANVAS_PADDING * 0.35 - radius,
    Math.max(visibleTopLeft.y, visibleBottomRight.y) - radius,
  );

  return {
    x: clamp(point.x, Math.min(minX, maxX), Math.max(minX, maxX)),
    y: clamp(point.y, Math.min(minY, maxY), Math.max(minY, maxY)),
  };
}

export function canPanCharacterGraphCanvas(isMobile: boolean, zoomState: ZoomState): boolean {
  return isMobile
    || zoomState.scale !== DEFAULT_ZOOM_STATE.scale
    || zoomState.offsetX !== DEFAULT_ZOOM_STATE.offsetX
    || zoomState.offsetY !== DEFAULT_ZOOM_STATE.offsetY;
}
