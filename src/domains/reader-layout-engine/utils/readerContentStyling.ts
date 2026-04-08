import type { CSSProperties } from 'react';
import type {
  ReaderContentContextVariant,
  ReaderContentLeafVariant,
  ReaderContentMode,
} from '@domains/reader-shell/constants/readerContentContract';
import type { ReaderContentVisualToken } from '@shared/reader-content';
import type { ReaderBlock } from './readerLayoutTypes';

import {
  READER_CONTENT_CLASS_NAMES,
  READER_CONTENT_CONTEXT_SPECS,
  READER_CONTENT_LEAF_SPECS,
  READER_CONTENT_MODE_CLASSES,
  READER_CONTENT_THEME_CLASSES,
} from '@domains/reader-shell/constants/readerContentContract';
import { createReaderContentMeasuredTokenValues } from '@shared/reader-content';
import { cn } from '@shared/utils/cn';

const LEAF_CLASSES_BY_VARIANT = Object.fromEntries(
  READER_CONTENT_LEAF_SPECS.map((spec) => [spec.leafVariant, spec.classNames.join(' ')]),
) as Record<ReaderContentLeafVariant, string>;

const CONTEXT_CLASSES_BY_VARIANT = Object.fromEntries(
  READER_CONTENT_CONTEXT_SPECS.map((spec) => [spec.contextVariant, spec.classNames.join(' ')]),
) as Record<ReaderContentContextVariant, string>;

type ReaderContentRootStyle = CSSProperties & Record<string, string>;

export interface ReaderContentRootProps {
  rootClassName: string;
  rootStyle: CSSProperties;
}

export interface ReaderContentRootTheme {
  contentVariables: Record<ReaderContentVisualToken, string>;
}

export function resolveReaderContentLeafVariant(
  block: Pick<ReaderBlock, 'kind' | 'renderRole'>,
): ReaderContentLeafVariant {
  if (block.kind === 'heading') {
    return 'heading';
  }

  if (block.kind === 'image') {
    return 'image';
  }

  if (block.renderRole === 'table') {
    return 'table';
  }

  if (block.renderRole === 'hr') {
    return 'hr';
  }

  if (block.renderRole === 'unsupported') {
    return 'unsupported';
  }

  return 'paragraph';
}

export function getReaderContentBlockClassName(
  block: Pick<ReaderBlock, 'kind' | 'renderRole'>,
): string {
  return LEAF_CLASSES_BY_VARIANT[resolveReaderContentLeafVariant(block)];
}

export function getReaderContentContextClassName(
  variant: ReaderContentContextVariant,
): string {
  return CONTEXT_CLASSES_BY_VARIANT[variant];
}

export function resolveReaderContentRootProps(params: {
  contentWidth: number;
  fontSize: number;
  lineSpacing: number;
  mode: ReaderContentMode;
  paragraphSpacing: number;
  readerTheme: string;
  theme: ReaderContentRootTheme;
}): ReaderContentRootProps {
  const measuredTokens = createReaderContentMeasuredTokenValues({
    fontSize: params.fontSize,
    lineSpacing: params.lineSpacing,
    paragraphSpacing: params.paragraphSpacing,
    viewportWidth: params.contentWidth,
  });

  const measuredVariables = Object.entries(measuredTokens).map(([token, value]) => [
    token,
    `${value}px`,
  ]);
  const visualVariables = Object.entries(params.theme.contentVariables);
  const themeClassName =
    READER_CONTENT_THEME_CLASSES[params.readerTheme as keyof typeof READER_CONTENT_THEME_CLASSES]
    ?? READER_CONTENT_THEME_CLASSES.auto;

  return {
    rootClassName: cn(
      READER_CONTENT_CLASS_NAMES.root,
      READER_CONTENT_MODE_CLASSES[params.mode],
      themeClassName,
    ),
    rootStyle: Object.fromEntries([
      ...measuredVariables,
      ...visualVariables,
    ]) as ReaderContentRootStyle,
  };
}
