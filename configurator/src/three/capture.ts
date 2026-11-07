// Zrzut PNG: render na żądanie i toDataURL (bez preserveDrawingBuffer).
export const capture: { fn: (() => string) | null } = { fn: null };

export function downloadDataUrl(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
