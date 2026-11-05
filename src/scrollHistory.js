export function scrollHistoryItem(container, item) {
  if (!container || !item) return;
  const bounds = container.getBoundingClientRect();
  const itemBounds = item.getBoundingClientRect();
  if (itemBounds.top < bounds.top) container.scrollTop += itemBounds.top - bounds.top;
  else if (itemBounds.bottom > bounds.bottom) container.scrollTop += itemBounds.bottom - bounds.bottom;
}
