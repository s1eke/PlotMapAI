import type { CharacterGraphEdge, CharacterGraphNode } from '@domains/analysis';

export interface ZoomState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export type LayoutNode = CharacterGraphNode & {
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
  radius: number;
  degree: number;
  score: number;
};

export type LayoutEdge = CharacterGraphEdge & {
  path: string;
  labelX: number;
  labelY: number;
};

export interface NodeLabelLayout {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  maxTextWidth: number;
}

export interface GraphViewportBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface FitZoomStateOptions {
  paddingX?: number;
  paddingTop?: number;
  paddingBottom?: number;
  targetCenterYRatio?: number;
  minScale?: number;
  maxScale?: number;
}

export const STAGE_WIDTH = 1440;
export const STAGE_HEIGHT = 960;
export const CANVAS_PADDING = 96;
export const MIN_ZOOM_SCALE = 0.72;
export const MAX_ZOOM_SCALE = 2.4;
export const DEFAULT_ZOOM_STATE: ZoomState = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

export function buildSpaciousLayout(nodes: CharacterGraphNode[], edges: CharacterGraphEdge[]): LayoutNode[] {
  if (nodes.length === 0) {
    return [];
  }

  const degreeMap = new Map<string, number>();
  edges.forEach((edge) => {
    degreeMap.set(edge.source, (degreeMap.get(edge.source) ?? 0) + 1);
    degreeMap.set(edge.target, (degreeMap.get(edge.target) ?? 0) + 1);
  });

  const sortedNodes = [...nodes].sort((a, b) => {
    if (Number(b.isCore) !== Number(a.isCore)) {
      return Number(b.isCore) - Number(a.isCore);
    }
    const degreeDiff = (degreeMap.get(b.id) ?? 0) - (degreeMap.get(a.id) ?? 0);
    if (degreeDiff !== 0) {
      return degreeDiff;
    }
    const scoreA = a.sharePercent > 0 ? a.sharePercent : a.weight;
    const scoreB = b.sharePercent > 0 ? b.sharePercent : b.weight;
    return scoreB - scoreA;
  });

  const layout = sortedNodes.map((node, index) => {
    const degree = degreeMap.get(node.id) ?? 0;
    const score = node.sharePercent > 0 ? node.sharePercent : node.weight;
    const radius = getNodeRadius(score, index === 0);
    const anchor = getAnchorPosition(index, sortedNodes.length);
    return {
      ...node,
      x: anchor.x,
      y: anchor.y,
      anchorX: anchor.x,
      anchorY: anchor.y,
      radius,
      degree,
      score,
    };
  });

  const indexMap = new Map(layout.map((node, index) => [node.id, index]));
  const positions = layout.map((node) => ({
    x: node.x,
    y: node.y,
    vx: 0,
    vy: 0,
  }));

  for (let iteration = 0; iteration < 220; iteration += 1) {
    for (let i = 0; i < layout.length; i += 1) {
      for (let j = i + 1; j < layout.length; j += 1) {
        const first = layout[i];
        const second = layout[j];
        const dx = positions[j].x - positions[i].x;
        const dy = positions[j].y - positions[i].y;
        const distance = Math.hypot(dx, dy) || 1;
        const minDistance = first.radius + second.radius + 108;
        const repulsion = distance < minDistance
          ? (minDistance - distance) * 0.34
          : 6200 / (distance * distance);
        const nx = dx / distance;
        const ny = dy / distance;
        positions[i].vx -= nx * repulsion;
        positions[i].vy -= ny * repulsion;
        positions[j].vx += nx * repulsion;
        positions[j].vy += ny * repulsion;
      }
    }

    edges.forEach((edge) => {
      const sourceIndex = indexMap.get(edge.source);
      const targetIndex = indexMap.get(edge.target);
      if (sourceIndex === undefined || targetIndex === undefined) return;
      const source = layout[sourceIndex];
      const target = layout[targetIndex];
      const dx = positions[targetIndex].x - positions[sourceIndex].x;
      const dy = positions[targetIndex].y - positions[sourceIndex].y;
      const distance = Math.hypot(dx, dy) || 1;
      const idealDistance = 240 + (source.radius + target.radius) * 1.55;
      const pull = (distance - idealDistance) * 0.006;
      const nx = dx / distance;
      const ny = dy / distance;
      positions[sourceIndex].vx += nx * pull;
      positions[sourceIndex].vy += ny * pull;
      positions[targetIndex].vx -= nx * pull;
      positions[targetIndex].vy -= ny * pull;
    });

    layout.forEach((node, index) => {
      const anchorStrength = index === 0 ? 0.048 : 0.016;
      positions[index].vx += (node.anchorX - positions[index].x) * anchorStrength;
      positions[index].vy += (node.anchorY - positions[index].y) * anchorStrength;

      positions[index].vx *= 0.76;
      positions[index].vy *= 0.76;
      positions[index].x = clamp(
        positions[index].x + positions[index].vx,
        CANVAS_PADDING + node.radius,
        STAGE_WIDTH - CANVAS_PADDING - node.radius,
      );
      positions[index].y = clamp(
        positions[index].y + positions[index].vy,
        CANVAS_PADDING + node.radius,
        STAGE_HEIGHT - CANVAS_PADDING - node.radius,
      );
    });
  }

  return layout.map((node, index) => ({
    ...node,
    x: Number(positions[index].x.toFixed(2)),
    y: Number(positions[index].y.toFixed(2)),
  }));
}

export function getAnchorPosition(index: number, total: number): { x: number; y: number } {
  if (index === 0) {
    return { x: STAGE_WIDTH / 2, y: STAGE_HEIGHT / 2 };
  }

  const ring = index <= 5 ? 0 : index <= 13 ? 1 : 2;
  const ringStart = ring === 0 ? 1 : ring === 1 ? 6 : 14;
  const ringSize = ring === 0
    ? Math.min(total - 1, 5)
    : ring === 1
      ? Math.min(Math.max(total - 6, 0), 8)
      : Math.max(total - 14, 0);
  const positionInRing = index - ringStart;
  const angleOffset = ring === 0 ? -Math.PI / 2 : ring === 1 ? -Math.PI / 2 + 0.16 : -Math.PI / 2 + 0.34;
  const angle = angleOffset + (positionInRing / Math.max(ringSize, 1)) * Math.PI * 2;
  const radiusX = ring === 0 ? 300 : ring === 1 ? 500 : 660;
  const radiusY = ring === 0 ? 220 : ring === 1 ? 360 : 440;
  const jitter = ring === 0 ? 0 : ring === 1 ? 14 : 20;

  return {
    x: Number((STAGE_WIDTH / 2 + Math.cos(angle) * radiusX + Math.sin(index * 1.21) * jitter).toFixed(2)),
    y: Number((STAGE_HEIGHT / 2 + Math.sin(angle) * radiusY + Math.cos(index * 1.37) * jitter).toFixed(2)),
  };
}

export function buildEdgeCurve(source: LayoutNode, target: LayoutNode, seed: number): {
  path: string;
  labelX: number;
  labelY: number;
} {
  const midX = (source.x + target.x) / 2;
  const midY = (source.y + target.y) / 2;
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.hypot(dx, dy) || 1;
  const normalX = -dy / distance;
  const normalY = dx / distance;
  const curve = Math.min(120, distance * 0.18) * (seed % 2 === 0 ? 1 : -1);
  const controlX = midX + normalX * curve;
  const controlY = midY + normalY * curve;

  return {
    path: `M ${source.x} ${source.y} Q ${controlX} ${controlY} ${target.x} ${target.y}`,
    labelX: Number(((midX + controlX) / 2).toFixed(2)),
    labelY: Number(((midY + controlY) / 2).toFixed(2)),
  };
}

export function getLayoutBounds(nodes: Array<Pick<LayoutNode, 'x' | 'y' | 'radius'>>): GraphViewportBounds | null {
  if (nodes.length === 0) {
    return null;
  }

  const minX = Math.min(...nodes.map((node) => node.x - node.radius));
  const maxX = Math.max(...nodes.map((node) => node.x + node.radius));
  const minY = Math.min(...nodes.map((node) => node.y - node.radius));
  const maxY = Math.max(...nodes.map((node) => node.y + node.radius));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  return {
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

export function getFitZoomState(
  nodes: Array<Pick<LayoutNode, 'x' | 'y' | 'radius'>>,
  options: FitZoomStateOptions = {},
): ZoomState {
  const bounds = getLayoutBounds(nodes);
  if (!bounds) {
    return DEFAULT_ZOOM_STATE;
  }

  const paddingX = options.paddingX ?? 132;
  const paddingTop = options.paddingTop ?? 120;
  const paddingBottom = options.paddingBottom ?? 216;
  const availableWidth = Math.max(1, STAGE_WIDTH - paddingX * 2);
  const availableHeight = Math.max(1, STAGE_HEIGHT - paddingTop - paddingBottom);
  const rawScale = Math.min(availableWidth / bounds.width, availableHeight / bounds.height);
  const scale = clamp(
    Number(rawScale.toFixed(4)),
    options.minScale ?? MIN_ZOOM_SCALE,
    options.maxScale ?? MAX_ZOOM_SCALE,
  );
  const targetCenterYRatio = options.targetCenterYRatio ?? 0.42;
  const targetCenterX = STAGE_WIDTH / 2;
  const targetCenterY = paddingTop + availableHeight * targetCenterYRatio;
  const nextOffset = clampZoomOffset(
    scale,
    targetCenterX - bounds.centerX * scale,
    targetCenterY - bounds.centerY * scale,
  );

  return {
    scale,
    ...nextOffset,
  };
}

export function getNodeRadius(score: number, isCenter: boolean): number {
  const minRadius = isCenter ? 40 : 28;
  const maxRadius = isCenter ? 66 : 52;
  const normalized = Math.max(0, Math.min(score / 30, 1));
  return Number((minRadius + (maxRadius - minRadius) * normalized).toFixed(2));
}

export function getNodeLabelLayout(name: string, radius: number): NodeLabelLayout {
  const displayName = getNodeDisplayName(name);
  const innerRadius = Math.max(16, radius - 8);
  const maxTextWidth = innerRadius * 1.68;
  const maxFontSize = Math.max(12, Math.min(18, innerRadius * 0.48));
  const minFontSize = Math.max(8, Math.min(11, innerRadius * 0.28));

  for (let lineCount = 1; lineCount <= 3; lineCount += 1) {
    for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 1) {
      const lineHeight = Math.max(10, fontSize * 0.94);
      const totalHeight = fontSize + (lineCount - 1) * lineHeight;
      if (totalHeight > innerRadius * 1.6) {
        continue;
      }

      const maxUnitsPerLine = maxTextWidth / fontSize;
      const lines = splitLabelIntoLines(displayName, maxUnitsPerLine, lineCount);
      if (!lines) {
        continue;
      }

      return {
        lines,
        fontSize: Number(fontSize.toFixed(1)),
        lineHeight: Number(lineHeight.toFixed(1)),
        maxTextWidth: Number(maxTextWidth.toFixed(2)),
      };
    }
  }

  const fallbackFontSize = Math.max(8, Math.min(10, innerRadius * 0.26));
  const fallbackLineHeight = Math.max(9, fallbackFontSize * 0.94);
  return {
    lines: splitLabelByUnits(displayName, Math.max(1.8, maxTextWidth / fallbackFontSize), 3),
    fontSize: Number(fallbackFontSize.toFixed(1)),
    lineHeight: Number(fallbackLineHeight.toFixed(1)),
    maxTextWidth: Number(maxTextWidth.toFixed(2)),
  };
}

export function estimateTextUnits(value: string): number {
  return Array.from(value).reduce((total, char) => total + estimateCharacterUnits(char), 0);
}

export function viewportPointToGraphPoint(point: { x: number; y: number }, zoomState: ZoomState): { x: number; y: number } {
  return {
    x: (point.x - zoomState.offsetX) / zoomState.scale,
    y: (point.y - zoomState.offsetY) / zoomState.scale,
  };
}

export function clampZoomOffset(scale: number, offsetX: number, offsetY: number): { offsetX: number; offsetY: number } {
  const slackX = CANVAS_PADDING * 0.6;
  const slackY = CANVAS_PADDING * 0.6;

  if (scale >= 1) {
    return {
      offsetX: Number(clamp(offsetX, STAGE_WIDTH - STAGE_WIDTH * scale - slackX, slackX).toFixed(2)),
      offsetY: Number(clamp(offsetY, STAGE_HEIGHT - STAGE_HEIGHT * scale - slackY, slackY).toFixed(2)),
    };
  }

  const centeredOffsetX = (STAGE_WIDTH - STAGE_WIDTH * scale) / 2;
  const centeredOffsetY = (STAGE_HEIGHT - STAGE_HEIGHT * scale) / 2;
  return {
    offsetX: Number(clamp(offsetX, centeredOffsetX - slackX, centeredOffsetX + slackX).toFixed(2)),
    offsetY: Number(clamp(offsetY, centeredOffsetY - slackY, centeredOffsetY + slackY).toFixed(2)),
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getNodeDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function splitLabelIntoLines(name: string, maxUnitsPerLine: number, maxLines: number): string[] | null {
  const lines = splitLabelByUnits(name, maxUnitsPerLine, maxLines);
  if (lines.length > maxLines) {
    return null;
  }
  if (lines.some((line) => estimateTextUnits(line) > maxUnitsPerLine + 0.05)) {
    return null;
  }
  return lines;
}

function splitLabelByUnits(name: string, maxUnitsPerLine: number, maxLines: number): string[] {
  const lines: string[] = [];
  let currentLine = '';
  let currentUnits = 0;

  for (const char of name) {
    const charUnits = estimateCharacterUnits(char);
    if (currentLine && currentUnits + charUnits > maxUnitsPerLine && lines.length < maxLines - 1) {
      lines.push(currentLine);
      currentLine = char;
      currentUnits = charUnits;
      continue;
    }
    currentLine += char;
    currentUnits += charUnits;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function estimateCharacterUnits(char: string): number {
  if (/\s/.test(char)) {
    return 0.36;
  }
  if (/[A-Z]/.test(char)) {
    return 0.72;
  }
  if (/[a-z0-9]/.test(char)) {
    return 0.58;
  }
  // eslint-disable-next-line no-control-regex
  if (/[^\u0000-\u00ff]/.test(char)) {
    return 1;
  }
  return 0.66;
}
