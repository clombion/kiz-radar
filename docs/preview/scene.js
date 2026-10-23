// Variant: scene map. A short introduction above the existing map, which becomes the landing view.
import { h } from '../js/ui.js';
import { mapView } from '../js/map.js';

export function sceneView(root, qs, { home }) {
  const mapRoot = h('div');
  root.replaceChildren(h('section', { class: 'ed scene' },
    h('header', { class: 'ed-hero compact' },
      h('p', { class: 'kicker' }, 'Kiz Radar · from Bergen'),
      h('h1', {}, 'The kizomba scene, on one map'),
      h('p', { class: 'lede' }, 'Every festival across Europe and beyond. Tap a city to see what’s on there, who’s teaching, and what the trip from Bergen costs.')),
    mapRoot));
  return mapView(mapRoot, [], 'color=kiz', { home });
}
