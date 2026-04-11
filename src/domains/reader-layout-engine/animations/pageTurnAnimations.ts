import type { ReaderPageTurnMode } from '../constants/pageTurnMode';

export type PageTurnDirection = 'next' | 'prev';

export interface PageTurnAnimationCustom {
  direction: PageTurnDirection;
}

export interface PageTurnAnimationTarget {
  [key: string]: number | string | undefined;
  opacity?: number;
  x?: number | string;
  zIndex?: number;
}

export interface PageTurnAnimationDefinition {
  initial: (custom: PageTurnAnimationCustom) => PageTurnAnimationTarget;
  animate: (custom: PageTurnAnimationCustom) => PageTurnAnimationTarget;
  exit: (custom: PageTurnAnimationCustom) => PageTurnAnimationTarget;
  transition: {
    duration: number;
    ease: [number, number, number, number];
  };
}

const COVER_TURN_DURATION = 1;
const SLIDE_TURN_DURATION = 1;
const DEFAULT_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const PAGE_TURN_LINEAR_EASE: [number, number, number, number] = [0.32, 0.72, 0.08, 1];

function getDirectionalOffset(direction: PageTurnDirection): string {
  return direction === 'next' ? '100%' : '-100%';
}

function getReverseDirectionalOffset(direction: PageTurnDirection): string {
  return direction === 'next' ? '-100%' : '100%';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getPageTurnSettleDuration(
  mode: Exclude<ReaderPageTurnMode, 'scroll'>,
  fromOffset: number,
  targetOffset: number,
  viewportWidth: number,
  velocityX: number,
): number {
  if (mode === 'none') {
    return 0;
  }

  if (viewportWidth <= 0) {
    return getPageTurnAnimation(mode).transition.duration;
  }

  const remainingRatio = clamp(Math.abs(targetOffset - fromOffset) / viewportWidth, 0, 1);
  const velocityRatio = clamp(Math.abs(velocityX) / 1600, 0, 1);
  const maxDuration = mode === 'cover' ? 0.18 : 0.16;
  const minDuration = mode === 'cover' ? 0.09 : 0.08;
  const distanceDuration = maxDuration * Math.max(0.35, remainingRatio);
  const velocityAdjusted = distanceDuration * (1 - velocityRatio * 0.3);

  return clamp(velocityAdjusted, minDuration, maxDuration);
}

export function getPageTurnAnimation(
  mode: Exclude<ReaderPageTurnMode, 'scroll'>,
): PageTurnAnimationDefinition {
  if (mode === 'cover') {
    return {
      initial: ({ direction }) => ({
        x: direction === 'next' ? 0 : '-100%',
        zIndex: direction === 'next' ? 1 : 2,
      }),
      animate: ({ direction }) => ({
        x: 0,
        zIndex: direction === 'next' ? 1 : 2,
      }),
      exit: ({ direction }) => ({
        x: direction === 'next' ? '-100%' : 0,
        zIndex: direction === 'next' ? 2 : 1,
      }),
      transition: {
        duration: COVER_TURN_DURATION,
        ease: PAGE_TURN_LINEAR_EASE,
      },
    };
  }

  if (mode === 'slide') {
    return {
      initial: ({ direction }) => ({
        x: getDirectionalOffset(direction),
        zIndex: 2,
      }),
      animate: () => ({
        x: 0,
        zIndex: 2,
      }),
      exit: ({ direction }) => ({
        x: getReverseDirectionalOffset(direction),
        zIndex: 1,
      }),
      transition: {
        duration: SLIDE_TURN_DURATION,
        ease: PAGE_TURN_LINEAR_EASE,
      },
    };
  }

  return {
    initial: () => ({
      x: 0,
      zIndex: 1,
    }),
    animate: () => ({
      x: 0,
      zIndex: 1,
    }),
    exit: () => ({
      x: 0,
      zIndex: 1,
    }),
    transition: {
      duration: 0,
      ease: DEFAULT_EASE,
    },
  };
}
