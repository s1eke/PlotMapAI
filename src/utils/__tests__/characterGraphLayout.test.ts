import { describe, expect, it } from 'vitest';
import {
  buildEdgeCurve,
  buildSpaciousLayout,
  CANVAS_PADDING,
  clampZoomOffset,
  getNodeLabelLayout,
  STAGE_HEIGHT,
  STAGE_WIDTH,
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

describe('characterGraphLayout', () => {
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

  it('builds curved edge metadata from layout nodes', () => {
    const layout = buildSpaciousLayout(nodes, edges);
    const curve = buildEdgeCurve(layout[0], layout[1], 0);

    expect(curve.path).toContain(`M ${layout[0].x} ${layout[0].y}`);
    expect(curve.path).toContain(`${layout[1].x} ${layout[1].y}`);
    expect(curve.labelX).toBeTypeOf('number');
    expect(curve.labelY).toBeTypeOf('number');
  });

  it('clamps zoom offsets for zoomed-in and zoomed-out states', () => {
    const zoomedIn = clampZoomOffset(1.8, 500, -800);
    const zoomedOut = clampZoomOffset(0.8, -900, 900);
    const epsilon = 0.01;

    expect(zoomedIn.offsetX).toBeLessThanOrEqual(CANVAS_PADDING * 0.6 + epsilon);
    expect(zoomedIn.offsetY).toBeGreaterThanOrEqual(STAGE_HEIGHT - STAGE_HEIGHT * 1.8 - CANVAS_PADDING * 0.6 - epsilon);
    expect(zoomedOut.offsetX).toBeGreaterThanOrEqual((STAGE_WIDTH - STAGE_WIDTH * 0.8) / 2 - CANVAS_PADDING * 0.6 - epsilon);
    expect(zoomedOut.offsetY).toBeLessThanOrEqual((STAGE_HEIGHT - STAGE_HEIGHT * 0.8) / 2 + CANVAS_PADDING * 0.6 + epsilon);
  });

  it('fits long labels into at most three lines', () => {
    const labelLayout = getNodeLabelLayout('非常非常长的角色名称LongName', 32);

    expect(labelLayout.lines.length).toBeLessThanOrEqual(3);
    expect(labelLayout.lines.every((line) => line.length > 0)).toBe(true);
    expect(labelLayout.fontSize).toBeGreaterThan(0);
  });
});
