import type { PurifyRule } from '@shared/text-processing';

import { purify } from '@shared/text-processing';

const HEADING_TAG_NAMES = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

function resolvePurifyTarget(element: Element | null): 'text' | 'heading' | 'caption' {
  let current = element;
  while (current) {
    if (current.localName === 'figcaption') {
      return 'caption';
    }

    if (HEADING_TAG_NAMES.has(current.localName)) {
      return 'heading';
    }

    current = getParentElement(current);
  }

  return 'text';
}

function getParentElement(node: Node): Element | null {
  const parent = node.parentNode;
  if (!parent || parent.nodeType !== ELEMENT_NODE) {
    return null;
  }

  return parent as Element;
}

function purifyNode(node: Node, rules: PurifyRule[], bookTitle: string): void {
  if (node.nodeType === TEXT_NODE) {
    const target = resolvePurifyTarget(getParentElement(node));
    const textNode = node;
    textNode.textContent = purify(textNode.textContent ?? '', rules, target, bookTitle, 'pre-ast');
    return;
  }

  if (node.nodeType !== ELEMENT_NODE) {
    return;
  }

  for (const child of Array.from(node.childNodes)) {
    purifyNode(child, rules, bookTitle);
  }
}

export function purifyEpubDom(
  root: ParentNode,
  rules: PurifyRule[],
  bookTitle: string,
): void {
  if (rules.length === 0) {
    return;
  }

  for (const child of Array.from(root.childNodes)) {
    purifyNode(child, rules, bookTitle);
  }
}
