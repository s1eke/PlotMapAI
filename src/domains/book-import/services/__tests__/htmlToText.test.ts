import { describe, expect, it } from 'vitest';
import { htmlToText } from '../epub/htmlToText';

describe('htmlToText', () => {
  it('removes blocked tag content even when the closing tag contains extra whitespace', () => {
    const html = '<div>Intro</div><script>alert(1)</script\t\n bar><p>Body</p>';
    expect(htmlToText(html)).toBe('Intro\nBody');
  });

  it('removes navigation-like blocks identified by class or id', () => {
    const html = '<section class="top-nav">Skip me</section><p>Keep me</p><div id="page-nav">And me too</div>';
    expect(htmlToText(html)).toBe('Keep me');
  });
});
