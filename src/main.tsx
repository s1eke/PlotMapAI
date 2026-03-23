import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n/config'
import App from './App.tsx'
import { ensureDefaultTocRules } from './services/db'

// PWA standalone: prevent iOS Safari rubber-band overscroll
// CSS overscroll-behavior is unsupported on iOS, so we intercept touchmove
if (window.matchMedia('(display-mode: standalone)').matches) {
  let lastY = 0;

  document.addEventListener('touchstart', (e) => {
    lastY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) return;

    const target = e.target as HTMLElement;
    const currentY = e.touches[0].clientY;
    const dy = currentY - lastY;
    lastY = currentY;

    // Find the nearest scrollable ancestor (or document.scrollingElement)
    let el: HTMLElement | null = target;
    let scrollable: Element = document.scrollingElement!;
    while (el && el !== document.body) {
      const style = window.getComputedStyle(el);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay') {
        if (el.scrollHeight > el.clientHeight) {
          scrollable = el;
          break;
        }
      }
      el = el.parentElement;
    }

    const atTop = scrollable.scrollTop <= 0;
    const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1;

    // Pulling down at top or pulling up at bottom → overscroll → block
    if ((dy > 0 && atTop) || (dy < 0 && atBottom)) {
      e.preventDefault();
    }
  }, { passive: false });
}

ensureDefaultTocRules()

console.log(`PlotMapAI v${__APP_VERSION__}`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
