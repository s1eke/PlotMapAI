import { AlignJustify, AlignVerticalSpaceAround, Type } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface SliderConfig {
  key: 'fontSize' | 'lineSpacing' | 'paragraphSpacing';
  icon: LucideIcon;
  labelKey: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

export const READER_SLIDER_CONFIG: SliderConfig[] = [
  {
    key: 'fontSize',
    icon: Type,
    labelKey: 'reader.fontSize',
    min: 14,
    max: 32,
    step: 1,
    format: (v) => `${v}px`,
  },
  {
    key: 'lineSpacing',
    icon: AlignJustify,
    labelKey: 'reader.lineSpacing',
    min: 1.0,
    max: 3.0,
    step: 0.1,
    format: (v) => v.toFixed(1),
  },
  {
    key: 'paragraphSpacing',
    icon: AlignVerticalSpaceAround,
    labelKey: 'reader.paragraphSpacing',
    min: 0,
    max: 32,
    step: 2,
    format: (v) => `${v}px`,
  },
];

export const MOBILE_SLIDER_KEYS: Array<SliderConfig['key']> = ['fontSize'];

export const OVERFLOW_SLIDER_KEYS: Array<SliderConfig['key']> = [
  'lineSpacing',
  'paragraphSpacing',
];
