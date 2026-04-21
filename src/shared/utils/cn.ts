import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 安全合并 Tailwind 类名的实用工具
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
