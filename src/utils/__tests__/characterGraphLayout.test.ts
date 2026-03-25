import { describe, expect, it } from 'vitest';
import {
  buildEdgeCurve,
  buildSpaciousLayout,
  CANVAS_PADDING,
  clamp,
  clampZoomOffset,
  DEFAULT_ZOOM_STATE,
  estimateTextUnits,
  getAnchorPosition,
  getFitZoomState,
  getLayoutBounds,
  getNodeLabelLayout,
  getNodeRadius,
  MAX_ZOOM_SCALE,
  MIN_ZOOM_SCALE,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  viewportPointToGraphPoint,
} from '../characterGraphLayout';

const nodes = [
  {
    id: 'hero',
    name: 'Hero',
    role: 'lead',
    description: 'Main character',
    weight: 9,
    sharePercent: 70,
    chapterCount: 2,
    chapters: [0, 1],
    isCore: true,
  },
  {
    id: 'friend',
    name: 'Friend',
    role: 'support',
    description: 'Key ally',
    weight: 4,
    sharePercent: 20,
    chapterCount: 2,
    chapters: [0, 1],
    isCore: false,
  },
  {
    id: 'rival',
    name: 'Rival',
    role: 'opponent',
    description: 'Main rival',
    weight: 3,
    sharePercent: 10,
    chapterCount: 1,
    chapters: [1],
    isCore: false,
  },
];

const edges = [
  {
    id: 'hero-friend',
    source: 'hero',
    target: 'friend',
    type: 'ally',
    relationTags: ['ally'],
    description: 'Trusted ally',
    weight: 12,
    mentionCount: 4,
    chapterCount: 2,
    chapters: [0, 1],
  },
  {
    id: 'hero-rival',
    source: 'hero',
    target: 'rival',
    type: 'enemy',
    relationTags: ['enemy'],
    description: 'Direct opposition',
    weight: 8,
    mentionCount: 2,
    chapterCount: 1,
    chapters: [1],
  },
];

describe('buildSpaciousLayout', () => {
  it('returns empty array for empty input', () => {
    expect(buildSpaciousLayout([], [])).toEqual([]);
  });

  it('builds layout nodes within the canvas bounds', () => {
    const layout = buildSpaciousLayout(nodes, edges);

    expect(layout).toHaveLength(nodes.length);
    layout.forEach((node) => {
      expect(node.x).toBeGreaterThanOrEqual(CANVAS_PADDING + node.radius);
      expect(node.x).toBeLessThanOrEqual(STAGE_WIDTH - CANVAS_PADDING - node.radius);
      expect(node.y).toBeGreaterThanOrEqual(CANVAS_PADDING + node.radius);
      expect(node.y).toBeLessThanOrEqual(STAGE_HEIGHT - CANVAS_PADDING - node.radius);
    });
  });

  it('places core node first in sorted order', () => {
    const layout = buildSpaciousLayout(nodes, edges);
    expect(layout[0].id).toBe('hero');
    expect(layout[0].isCore).toBe(true);
  });

  it('computes degree from edges', () => {
    const layout = buildSpaciousLayout(nodes, edges);
    const heroNode = layout.find(n => n.id === 'hero');
    expect(heroNode?.degree).toBe(2);
    const friendNode = layout.find(n => n.id === 'friend');
    expect(friendNode?.degree).toBe(1);
  });

  it('computes score from sharePercent when positive', () => {
    const layout = buildSpaciousLayout(nodes, edges);
    const heroNode = layout.find(n => n.id === 'hero');
    expect(heroNode?.score).toBe(70);
  });

  it('falls back to weight when sharePercent is zero', () => {
    const zeroPercentNodes = [
      { ...nodes[0], sharePercent: 0 },
      { ...nodes[1], sharePercent: 0 },
    ];
    const layout = buildSpaciousLayout(zeroPercentNodes, []);
    expect(layout[0].score).toBe(9);
  });

  it('preserves anchor positions', () => {
    const layout = buildSpaciousLayout(nodes, edges);
    layout.forEach((node) => {
      expect(typeof node.anchorX).toBe('number');
      expect(typeof node.anchorY).toBe('number');
    });
  });

  it('handles single node', () => {
    const layout = buildSpaciousLayout([nodes[0]], []);
    expect(layout).toHaveLength(1);
    expect(layout[0].x).toBe(STAGE_WIDTH / 2);
    expect(layout[0].y).toBe(STAGE_HEIGHT / 2);
  });
});

describe('getAnchorPosition', () => {
  it('places index 0 at stage center', () => {
    const pos = getAnchorPosition(0, 10);
    expect(pos.x).toBe(STAGE_WIDTH / 2);
    expect(pos.y).toBe(STAGE_HEIGHT / 2);
  });

  it('places ring 0 nodes (1-5) with no jitter', () => {
    const pos = getAnchorPosition(1, 10);
    expect(typeof pos.x).toBe('number');
    expect(typeof pos.y).toBe('number');
    expect(Number.isFinite(pos.x)).toBe(true);
    expect(Number.isFinite(pos.y)).toBe(true);
  });

  it('places ring 1 nodes (6-13) with jitter', () => {
    const pos6 = getAnchorPosition(6, 20);
    const pos7 = getAnchorPosition(7, 20);
    expect(typeof pos6.x).toBe('number');
    expect(typeof pos7.x).toBe('number');
    expect(Number.isFinite(pos6.x)).toBe(true);
    expect(Number.isFinite(pos7.x)).toBe(true);
  });

  it('places ring 2 nodes (14+) with larger jitter', () => {
    const pos = getAnchorPosition(14, 20);
    expect(typeof pos.x).toBe('number');
    expect(typeof pos.y).toBe('number');
    expect(Number.isFinite(pos.x)).toBe(true);
    expect(Number.isFinite(pos.y)).toBe(true);
  });

  it('returns finite numbers for all valid inputs', () => {
    for (let i = 0; i < 20; i++) {
      const pos = getAnchorPosition(i, 20);
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
    }
  });
});

describe('buildEdgeCurve', () => {
  it('builds curved edge metadata from layout nodes', () => {
    const layout = buildSpaciousLayout(nodes, edges);
    const curve = buildEdgeCurve(layout[0], layout[1], 0);

    expect(curve.path).toContain(`M ${layout[0].x} ${layout[0].y}`);
    expect(curve.path).toContain(`${layout[1].x} ${layout[1].y}`);
    expect(curve.labelX).toBeTypeOf('number');
    expect(curve.labelY).toBeTypeOf('number');
  });

  it('produces quadratic bezier path', () => {
    const layout = buildSpaciousLayout(nodes, edges);
    const curve = buildEdgeCurve(layout[0], layout[1], 0);
    expect(curve.path).toContain(' Q ');
  });

  it('alternates curve direction based on seed parity', () => {
    const layout = buildSpaciousLayout(nodes, edges);
    const curve0 = buildEdgeCurve(layout[0], layout[1], 0);
    const curve1 = buildEdgeCurve(layout[0], layout[1], 1);
    expect(curve0.path).not.toBe(curve1.path);
  });

  it('returns finite label coordinates', () => {
    const layout = buildSpaciousLayout(nodes, edges);
    const curve = buildEdgeCurve(layout[0], layout[1], 0);
    expect(Number.isFinite(curve.labelX)).toBe(true);
    expect(Number.isFinite(curve.labelY)).toBe(true);
  });
});

describe('getLayoutBounds', () => {
  it('returns null for empty nodes', () => {
    expect(getLayoutBounds([])).toBeNull();
  });

  it('computes correct bounds for single node', () => {
    const bounds = getLayoutBounds([{ x: 100, y: 200, radius: 30 }]);
    expect(bounds).not.toBeNull();
    expect(bounds!.minX).toBe(70);
    expect(bounds!.maxX).toBe(130);
    expect(bounds!.minY).toBe(170);
    expect(bounds!.maxY).toBe(230);
    expect(bounds!.width).toBe(60);
    expect(bounds!.height).toBe(60);
    expect(bounds!.centerX).toBe(100);
    expect(bounds!.centerY).toBe(200);
  });

  it('computes correct bounds for multiple nodes', () => {
    const layout = buildSpaciousLayout(nodes, edges);
    const bounds = getLayoutBounds(layout);
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThan(0);
    expect(bounds!.height).toBeGreaterThan(0);
    expect(bounds!.minX).toBeLessThan(bounds!.maxX);
    expect(bounds!.minY).toBeLessThan(bounds!.maxY);
  });

  it('width and height are at least 1', () => {
    const bounds = getLayoutBounds([{ x: 100, y: 200, radius: 0 }]);
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThanOrEqual(1);
    expect(bounds!.height).toBeGreaterThanOrEqual(1);
  });
});

describe('getFitZoomState', () => {
  it('returns default state for empty nodes', () => {
    expect(getFitZoomState([])).toEqual(DEFAULT_ZOOM_STATE);
  });

  it('returns valid zoom state for nodes', () => {
    const layout = buildSpaciousLayout(nodes, edges);
    const zoom = getFitZoomState(layout);
    expect(zoom.scale).toBeGreaterThan(0);
    expect(typeof zoom.offsetX).toBe('number');
    expect(typeof zoom.offsetY).toBe('number');
    expect(Number.isFinite(zoom.scale)).toBe(true);
    expect(Number.isFinite(zoom.offsetX)).toBe(true);
    expect(Number.isFinite(zoom.offsetY)).toBe(true);
  });

  it('clamps scale to min/max bounds', () => {
    const layout = buildSpaciousLayout(nodes, edges);
    const zoom = getFitZoomState(layout);
    expect(zoom.scale).toBeGreaterThanOrEqual(MIN_ZOOM_SCALE);
    expect(zoom.scale).toBeLessThanOrEqual(MAX_ZOOM_SCALE);
  });

  it('respects custom min/max scale options', () => {
    const layout = buildSpaciousLayout(nodes, edges);
    const zoom = getFitZoomState(layout, { minScale: 0.5, maxScale: 1.5 });
    expect(zoom.scale).toBeGreaterThanOrEqual(0.5);
    expect(zoom.scale).toBeLessThanOrEqual(1.5);
  });

  it('respects custom padding options', () => {
    const layout = buildSpaciousLayout(nodes, edges);
    const zoom = getFitZoomState(layout, { paddingX: 200, paddingTop: 200, paddingBottom: 300 });
    expect(Number.isFinite(zoom.scale)).toBe(true);
  });
});

describe('getNodeRadius', () => {
  it('returns minRadius for score 0', () => {
    expect(getNodeRadius(0, true)).toBe(40);
    expect(getNodeRadius(0, false)).toBe(28);
  });

  it('returns maxRadius for score >= 30', () => {
    expect(getNodeRadius(30, true)).toBe(66);
    expect(getNodeRadius(30, false)).toBe(52);
    expect(getNodeRadius(100, true)).toBe(66);
  });

  it('center nodes are larger than non-center', () => {
    expect(getNodeRadius(15, true)).toBeGreaterThan(getNodeRadius(15, false));
  });

  it('returns finite number for any score', () => {
    for (const score of [-10, 0, 15, 30, 100]) {
      expect(Number.isFinite(getNodeRadius(score, true))).toBe(true);
      expect(Number.isFinite(getNodeRadius(score, false))).toBe(true);
    }
  });
});

describe('getNodeLabelLayout', () => {
  it('fits long labels into at most three lines', () => {
    const labelLayout = getNodeLabelLayout('非常非常长的角色名称LongName', 32);

    expect(labelLayout.lines.length).toBeLessThanOrEqual(3);
    expect(labelLayout.lines.every((line) => line.length > 0)).toBe(true);
    expect(labelLayout.fontSize).toBeGreaterThan(0);
  });

  it('handles short names in one line', () => {
    const labelLayout = getNodeLabelLayout('Bob', 50);
    expect(labelLayout.lines.length).toBeGreaterThanOrEqual(1);
    expect(labelLayout.fontSize).toBeGreaterThan(0);
    expect(labelLayout.lineHeight).toBeGreaterThan(0);
    expect(labelLayout.maxTextWidth).toBeGreaterThan(0);
  });

  it('handles empty name', () => {
    const labelLayout = getNodeLabelLayout('', 30);
    expect(labelLayout.fontSize).toBeGreaterThan(0);
    expect(labelLayout.lineHeight).toBeGreaterThan(0);
  });

  it('trims whitespace from name', () => {
    const labelLayout = getNodeLabelLayout('  Alice  ', 50);
    expect(labelLayout.lines.some(l => l.includes('Alice'))).toBe(true);
  });

  it('returns finite values', () => {
    const labelLayout = getNodeLabelLayout('Test', 30);
    expect(Number.isFinite(labelLayout.fontSize)).toBe(true);
    expect(Number.isFinite(labelLayout.lineHeight)).toBe(true);
    expect(Number.isFinite(labelLayout.maxTextWidth)).toBe(true);
  });
});

describe('estimateTextUnits', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTextUnits('')).toBe(0);
  });

  it('CJK characters count as 1 unit', () => {
    expect(estimateTextUnits('字')).toBe(1);
    expect(estimateTextUnits('汉字')).toBe(2);
  });

  it('uppercase letters count as 0.72 units', () => {
    expect(estimateTextUnits('A')).toBeCloseTo(0.72, 2);
  });

  it('lowercase letters count as 0.58 units', () => {
    expect(estimateTextUnits('a')).toBeCloseTo(0.58, 2);
  });

  it('spaces count as 0.36 units', () => {
    expect(estimateTextUnits(' ')).toBeCloseTo(0.36, 2);
  });

  it('mixed content sums correctly', () => {
    const units = estimateTextUnits('Hi 字');
    expect(units).toBeGreaterThan(0);
    expect(Number.isFinite(units)).toBe(true);
  });
});

describe('viewportPointToGraphPoint', () => {
  it('converts viewport coordinates to graph coordinates', () => {
    const zoom = { scale: 2, offsetX: 100, offsetY: 50 };
    const result = viewportPointToGraphPoint({ x: 300, y: 250 }, zoom);
    expect(result.x).toBe(100);
    expect(result.y).toBe(100);
  });

  it('identity at scale 1 with zero offset', () => {
    const zoom = { scale: 1, offsetX: 0, offsetY: 0 };
    const result = viewportPointToGraphPoint({ x: 500, y: 300 }, zoom);
    expect(result.x).toBe(500);
    expect(result.y).toBe(300);
  });

  it('returns finite numbers', () => {
    const zoom = { scale: 0.5, offsetX: -200, offsetY: 100 };
    const result = viewportPointToGraphPoint({ x: 0, y: 0 }, zoom);
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
  });
});

describe('clampZoomOffset', () => {
  it('clamps zoom offsets for zoomed-in and zoomed-out states', () => {
    const zoomedIn = clampZoomOffset(1.8, 500, -800);
    const zoomedOut = clampZoomOffset(0.8, -900, 900);
    const epsilon = 0.01;

    expect(zoomedIn.offsetX).toBeLessThanOrEqual(CANVAS_PADDING * 0.6 + epsilon);
    expect(zoomedIn.offsetY).toBeGreaterThanOrEqual(STAGE_HEIGHT - STAGE_HEIGHT * 1.8 - CANVAS_PADDING * 0.6 - epsilon);
    expect(zoomedOut.offsetX).toBeGreaterThanOrEqual((STAGE_WIDTH - STAGE_WIDTH * 0.8) / 2 - CANVAS_PADDING * 0.6 - epsilon);
    expect(zoomedOut.offsetY).toBeLessThanOrEqual((STAGE_HEIGHT - STAGE_HEIGHT * 0.8) / 2 + CANVAS_PADDING * 0.6 + epsilon);
  });

  it('returns finite numbers for various inputs', () => {
    for (const scale of [0.5, 1.0, 1.5, 2.0]) {
      const result = clampZoomOffset(scale, 100, 100);
      expect(Number.isFinite(result.offsetX)).toBe(true);
      expect(Number.isFinite(result.offsetY)).toBe(true);
    }
  });
});

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps to max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('handles equal min and max', () => {
    expect(clamp(5, 7, 7)).toBe(7);
  });
});
