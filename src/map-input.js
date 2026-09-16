const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// anchor is measured in viewport pixels, relative to its centre.
export function zoomCamera(camera, factor, anchor, viewport, limits) {
  const width = clamp(camera.width / factor, limits.min, limits.max);
  const units = (camera.width - width) / viewport.width;
  return {x: camera.x + anchor[0] * units, y: camera.y + anchor[1] * units, width};
}

export function wheelCamera(camera, event, anchor, viewport, limits) {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.height : 1;
  const dx = event.deltaX * unit, dy = event.deltaY * unit;
  // Pixel scroll follows two fingers; browsers report trackpad pinch as Ctrl+wheel.
  // Line/page wheels and explicit Ctrl/⌘+wheel retain cursor-centred zoom.
  if (event.ctrlKey || event.metaKey || event.deltaMode > 0) {
    const sensitivity = event.ctrlKey && !event.deltaMode ? .01 : .002;
    return zoomCamera(camera, Math.exp(clamp(-dy * sensitivity, -.4, .4)), anchor, viewport, limits);
  }
  const units = camera.width / viewport.width;
  return {x: camera.x + dx * units, y: camera.y + dy * units, width: camera.width};
}
