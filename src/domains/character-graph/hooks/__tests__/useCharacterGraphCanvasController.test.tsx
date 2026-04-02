import { act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterGraphResponse } from '@shared/contracts';
import { STAGE_WIDTH, viewportPointToGraphPoint } from '../../utils/characterGraphLayout';
import { useCharacterGraphCanvasController } from '../useCharacterGraphCanvasController';

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

function createMockSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const rect: DOMRect = {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    top: 0,
    right: 100,
    bottom: 100,
    left: 0,
    toJSON: () => ({}),
  };
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(rect);
  return svg;
}

function attachSvg(result: ReturnType<typeof renderHook<typeof useCharacterGraphCanvasController>>['result']): SVGSVGElement {
  const svg = createMockSvg();
  act(() => {
    const svgRef = result.current.bindings.svgRef as { current: SVGSVGElement | null };
    svgRef.current = svg;
  });
  return svg;
}

function createPointerEventData(overrides: Record<string, unknown> = {}) {
  return {
    pointerId: 1,
    clientX: 50,
    clientY: 50,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  };
}

describe('useCharacterGraphCanvasController', () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;

  beforeEach(() => {
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(performance.now());
      return 1;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = vi.fn();
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    vi.restoreAllMocks();
  });

  it('applies a fitted mobile viewport on first render', async () => {
    const { result } = renderHook(() => useCharacterGraphCanvasController({
      graph,
      isMobile: true,
      t: testT,
    }));

    await waitFor(() => {
      expect(result.current.viewport.zoomState.scale).toBeGreaterThan(1);
      expect(result.current.viewport.zoomState.offsetY).not.toBe(0);
    });
  });

  it('keeps the user-adjusted mobile viewport on rerender with the same graph data', async () => {
    const { result, rerender } = renderHook(
      ({ graphData, isMobile }) => useCharacterGraphCanvasController({
        graph: graphData,
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
      expect(result.current.viewport.zoomState.scale).toBeGreaterThan(1);
    });

    attachSvg(result);

    act(() => {
      result.current.bindings.onCanvasPointerDown(createPointerEventData({
        pointerId: 1,
        clientX: 50,
        clientY: 50,
      }) as never);
    });

    fireEvent.pointerMove(window, { pointerId: 1, clientX: 78, clientY: 84 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    await waitFor(() => {
      expect(result.current.viewport.zoomState.offsetX).not.toBe(0);
    });

    const zoomAfterPan = result.current.viewport.zoomState;
    rerender({ graphData: graph, isMobile: true });

    await waitFor(() => {
      expect(result.current.viewport.zoomState).toEqual(zoomAfterPan);
    });
  });

  it('pans the mobile canvas without selecting a node', async () => {
    const { result } = renderHook(() => useCharacterGraphCanvasController({
      graph,
      isMobile: true,
      t: testT,
    }));

    await waitFor(() => {
      expect(result.current.layout.nodes.length).toBeGreaterThan(0);
    });

    attachSvg(result);
    const initialZoom = result.current.viewport.zoomState;

    act(() => {
      result.current.bindings.onCanvasPointerDown(createPointerEventData({
        pointerId: 1,
        clientX: 48,
        clientY: 44,
      }) as never);
    });

    fireEvent.pointerMove(window, { pointerId: 1, clientX: 72, clientY: 78 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    await waitFor(() => {
      expect(result.current.viewport.zoomState.offsetX).not.toBe(initialZoom.offsetX);
      expect(result.current.layout.selectedNodeId).toBeNull();
    });
  });

  it('keeps node tap selection but treats large movement as dragging instead of a tap', async () => {
    const { result } = renderHook(() => useCharacterGraphCanvasController({
      graph,
      isMobile: true,
      t: testT,
    }));

    await waitFor(() => {
      expect(result.current.layout.nodes.length).toBeGreaterThan(0);
    });

    attachSvg(result);
    const heroNode = result.current.layout.nodes.find((node) => node.id === 'hero');
    expect(heroNode).toBeDefined();

    act(() => {
      result.current.bindings.onNodePointerDown(createPointerEventData({
        pointerId: 1,
        clientX: 50,
        clientY: 50,
      }) as never, heroNode!);
    });

    fireEvent.pointerUp(window, { pointerId: 1 });

    await waitFor(() => {
      expect(result.current.layout.selectedNodeId).toBe('hero');
    });

    act(() => {
      result.current.actions.clearSelection();
    });

    const initialHeroPosition = result.current.layout.nodes.find((node) => node.id === 'hero');

    act(() => {
      result.current.bindings.onNodePointerDown(createPointerEventData({
        pointerId: 1,
        clientX: 50,
        clientY: 50,
      }) as never, heroNode!);
    });

    fireEvent.pointerMove(window, { pointerId: 1, clientX: 76, clientY: 86 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    await waitFor(() => {
      const movedHero = result.current.layout.nodes.find((node) => node.id === 'hero');
      expect(result.current.layout.selectedNodeId).toBeNull();
      expect(movedHero?.x).not.toBe(initialHeroPosition?.x);
    });
  });

  it('lets nodes reach the visible mobile canvas edges while dragging', async () => {
    const { result } = renderHook(() => useCharacterGraphCanvasController({
      graph,
      isMobile: true,
      t: testT,
    }));

    await waitFor(() => {
      expect(result.current.layout.nodes.length).toBeGreaterThan(0);
      expect(result.current.viewport.zoomState.scale).toBeGreaterThan(1);
    });

    attachSvg(result);
    const heroNode = result.current.layout.nodes.find((node) => node.id === 'hero');
    expect(heroNode).toBeDefined();

    act(() => {
      result.current.bindings.onNodePointerDown(createPointerEventData({
        pointerId: 1,
        clientX: 50,
        clientY: 50,
      }) as never, heroNode!);
    });

    fireEvent.pointerMove(window, { pointerId: 1, clientX: 140, clientY: 140 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    await waitFor(() => {
      const movedHero = result.current.layout.nodes.find((node) => node.id === 'hero');
      const visibleBottomRight = viewportPointToGraphPoint(
        { x: STAGE_WIDTH, y: result.current.layout.stageHeight },
        result.current.viewport.zoomState,
      );

      expect(movedHero).toBeDefined();
      expect(movedHero!.x).toBeCloseTo(visibleBottomRight.x - movedHero!.radius, 1);
      expect(movedHero!.y).toBeCloseTo(visibleBottomRight.y - movedHero!.radius, 1);
    });
  });

  it('supports pinch zoom on mobile without jumping away from the viewport', async () => {
    const { result } = renderHook(() => useCharacterGraphCanvasController({
      graph,
      isMobile: true,
      t: testT,
    }));

    await waitFor(() => {
      expect(result.current.viewport.zoomState.scale).toBeGreaterThan(1);
    });

    attachSvg(result);
    const initialZoom = result.current.viewport.zoomState;

    act(() => {
      result.current.bindings.onCanvasPointerDown(createPointerEventData({
        pointerId: 1,
        clientX: 30,
        clientY: 40,
      }) as never);
      result.current.bindings.onCanvasPointerDown(createPointerEventData({
        pointerId: 2,
        clientX: 70,
        clientY: 40,
      }) as never);
    });

    fireEvent.pointerMove(window, { pointerId: 2, clientX: 90, clientY: 40 });

    await waitFor(() => {
      expect(result.current.viewport.zoomState.scale).toBeGreaterThan(initialZoom.scale);
    });

    fireEvent.pointerUp(window, { pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 2 });

    await waitFor(() => {
      expect(result.current.gesture.isInteracting).toBe(false);
    });
  });

  it('cleans up global pointer listeners on unmount', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useCharacterGraphCanvasController({
      graph,
      isMobile: true,
      t: testT,
    }));

    await waitFor(() => {
      expect(addEventListenerSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('pointercancel', expect.any(Function));
    });

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('pointercancel', expect.any(Function));
  });
});
