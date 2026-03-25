import { act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CharacterGraphResponse } from '@domains/analysis';
import { useCharacterGraphCanvas } from '../useCharacterGraphCanvas';

const testT = ((key: string) => key) as TFunction;

const graph: CharacterGraphResponse = {
  nodes: [
    {
      id: 'hero',
      name: 'Hero',
      role: 'lead',
      description: 'Main character',
      weight: 9,
      sharePercent: 60,
      chapterCount: 3,
      chapters: [0, 1, 2],
      isCore: true,
    },
    {
      id: 'friend',
      name: 'Friend',
      role: 'support',
      description: 'Trusted ally',
      weight: 5,
      sharePercent: 22,
      chapterCount: 3,
      chapters: [0, 1, 2],
      isCore: false,
    },
    {
      id: 'mentor',
      name: 'Mentor',
      role: 'guide',
      description: 'Guides the hero',
      weight: 4,
      sharePercent: 18,
      chapterCount: 2,
      chapters: [0, 2],
      isCore: false,
    },
  ],
  edges: [
    {
      id: 'hero-friend',
      source: 'hero',
      target: 'friend',
      type: 'ally',
      relationTags: ['ally'],
      description: 'Works closely together',
      weight: 12,
      mentionCount: 5,
      chapterCount: 3,
      chapters: [0, 1, 2],
    },
    {
      id: 'hero-mentor',
      source: 'hero',
      target: 'mentor',
      type: 'mentor',
      relationTags: ['mentor'],
      description: 'Offers guidance',
      weight: 8,
      mentionCount: 3,
      chapterCount: 2,
      chapters: [0, 2],
    },
  ],
  meta: {
    totalChapters: 3,
    analyzedChapters: 3,
    nodeCount: 3,
    edgeCount: 2,
    hasOverview: true,
    hasData: true,
    isComplete: true,
    generatedAt: null,
  },
};

describe('useCharacterGraphCanvas', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies a fitted mobile viewport on first render', async () => {
    const { result } = renderHook(() => useCharacterGraphCanvas({
      graph,
      isLoading: false,
      isMobile: true,
      t: testT,
    }));

    await waitFor(() => {
      expect(result.current.zoomState.scale).toBeGreaterThan(1);
      expect(result.current.zoomState.offsetY).not.toBe(0);
    });
  });

  it('keeps the user-adjusted mobile viewport on rerender with the same graph data', async () => {
    const { result, rerender } = renderHook(
      ({ graphData, isMobile }) => useCharacterGraphCanvas({
        graph: graphData,
        isLoading: false,
        isMobile,
        t: testT,
      }),
      {
        initialProps: {
          graphData: graph,
          isMobile: true,
        },
      },
    );

    await waitFor(() => {
      expect(result.current.zoomState.scale).toBeGreaterThan(1);
    });

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      top: 0,
      right: 100,
      bottom: 100,
      left: 0,
      toJSON: () => ({}),
    } as DOMRect);

    act(() => {
      (result.current.svgRef as { current: SVGSVGElement | null }).current = svg;
    });

    act(() => {
      result.current.handleCanvasPointerDown({
        clientX: 50,
        clientY: 50,
        preventDefault: vi.fn(),
      } as never);
    });

    fireEvent.pointerMove(window, { clientX: 74, clientY: 82 });
    fireEvent.pointerUp(window);

    await waitFor(() => {
      expect(result.current.zoomState.offsetX).not.toBe(0);
    });

    const zoomAfterPan = result.current.zoomState;
    rerender({ graphData: graph, isMobile: true });

    await waitFor(() => {
      expect(result.current.zoomState).toEqual(zoomAfterPan);
    });
  });
});
