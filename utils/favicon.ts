/**
 * Utility for dynamically changing the browser favicon
 * Used to show emoji reactions in the favicon when players throw emojis
 */

const ORIGINAL_FAVICON = '/favicon.svg';
const FAVICON_SIZE = 32; // Standard favicon size

/**
 * Changes the favicon to display an emoji
 * @param emoji - The emoji character to display
 * @returns A function to restore the original favicon
 */
export function setEmojiFavicon(emoji: string): () => void {
  // Create a canvas to render the emoji as an image
  const canvas = document.createElement('canvas');
  canvas.width = FAVICON_SIZE;
  canvas.height = FAVICON_SIZE;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.warn('Could not get canvas context for favicon');
    return () => {}; // Return no-op function
  }

  // Set emoji font and render centered
  ctx.font = `${FAVICON_SIZE - 4}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, FAVICON_SIZE / 2, FAVICON_SIZE / 2);

  // Convert canvas to data URL
  const dataUrl = canvas.toDataURL('image/png');

  // Update favicon link
  changeFaviconHref(dataUrl);

  // Return restore function
  return () => restoreOriginalFavicon();
}

/**
 * Restores the original favicon
 */
export function restoreOriginalFavicon(): void {
  changeFaviconHref(ORIGINAL_FAVICON);
}

/**
 * Changes the href of the favicon link element
 */
function changeFaviconHref(href: string): void {
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");

  if (!link) {
    // Create favicon link if it doesn't exist
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }

  link.href = href;
}

/**
 * Temporarily shows an emoji in the favicon, then restores the original
 * @param emoji - The emoji to display
 * @param duration - How long to show the emoji in milliseconds (default: 3000ms)
 */
export function flashEmojiFavicon(emoji: string, duration: number = 3000): void {
  const restore = setEmojiFavicon(emoji);
  setTimeout(restore, duration);
}
