import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './domains/reader-shell/styles/readerContent.css';
import './i18n/config';
import '@application/services/readerContentController';
import App from '@app/App';
import { initializeAppSafely } from '@app/bootstrap/startup';

function findNearestScrollableAncestor(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }

  const declaredScrollContainer = target.closest<HTMLElement>('[data-scroll-container="true"]');
  if (
    declaredScrollContainer
    && declaredScrollContainer.scrollHeight > declaredScrollContainer.clientHeight
  ) {
    return declaredScrollContainer;
  }

  let element: HTMLElement | null = target;
  while (element && element !== document.body) {
    const style = window.getComputedStyle(element);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay') {
      if (element.scrollHeight > element.clientHeight) {
        return element;
      }
    }
    element = element.parentElement;
  }

  return null;
}

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

    const scrollable = findNearestScrollableAncestor(target) ?? document.scrollingElement!;

    const atTop = scrollable.scrollTop <= 0;
    const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1;

    // Pulling down at top or pulling up at bottom → overscroll → block
    if ((dy > 0 && atTop) || (dy < 0 && atBottom)) {
      e.preventDefault();
    }
  }, { passive: false });
}


const startupState = await initializeAppSafely();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App startupState={startupState} />
  </StrictMode>,
);
