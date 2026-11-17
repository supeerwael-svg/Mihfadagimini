import type React from 'react';

export function triggerRipple(event: React.MouseEvent<HTMLElement>): void {
  const target = event.currentTarget;
  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const wave = document.createElement('span');
  wave.className = 'ripple-wave';
  wave.style.width = `${size}px`;
  wave.style.height = `${size}px`;
  wave.style.left = `${event.clientX - rect.left - size / 2}px`;
  wave.style.top = `${event.clientY - rect.top - size / 2}px`;
  target.appendChild(wave);
  window.setTimeout(() => {
    wave.remove();
  }, 500);
}
