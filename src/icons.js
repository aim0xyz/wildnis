const paths = {
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>',
  food: '<path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M15 3v18M15 3c4 2 5 7 0 10"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  sunset: '<path d="M4 18h16M6 14a6 6 0 0 1 12 0M12 3v3M4.9 6.9l2.1 2M19.1 6.9l-2.1 2"/>',
  moon: '<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 9 9 0 1 0 20.5 14.2Z"/>',
  craft: '<path d="m14.7 6.3 3-3a2.1 2.1 0 0 1 3 3l-3 3M16 8l-9.5 9.5-3 1 1-3L14 6M13 19h8M17 15h4"/>',
  backpack: '<path d="M8 7V5a4 4 0 0 1 8 0v2M5 8h14a2 2 0 0 1 2 2v11H3V10a2 2 0 0 1 2-2ZM8 13h8v5H8z"/>',
  tent: '<path d="m3 20 9-16 9 16M12 4v16M8 20l4-7 4 7"/>',
  sprout: '<path d="M7 20h10M12 20v-9M12 11C7 11 5 8 5 4c5 0 7 3 7 7ZM12 14c5 0 7-3 7-7-5 0-7 3-7 7Z"/>',
  fist: '<path d="M7 11V7a2 2 0 0 1 4 0v4M11 10V5a2 2 0 0 1 4 0v6M15 10V7a2 2 0 0 1 4 0v7c0 5-3 7-7 7s-7-3-7-7v-2a2 2 0 0 1 4 0v1"/>',
  wood: '<path d="M5 18 17 4l3 3L8 21zM5 18l3 3M14 7l3 3"/>',
  rock: '<path d="m4 16 3-9 6-4 6 5 1 9-5 4H8zM7 7l5 5 7-4M12 12l3 9"/>',
  wool: '<path d="M8 6a4 4 0 0 1 8 0 4 4 0 0 1 2 7 4 4 0 0 1-4 6h-4a4 4 0 0 1-4-6 4 4 0 0 1 2-7ZM9 10h6M9 14h6"/>',
  berries: '<circle cx="9" cy="10" r="3"/><circle cx="15" cy="10" r="3"/><circle cx="12" cy="15" r="3"/><path d="M12 7V3m0 2 4-2"/>',
  meat: '<path d="M8 18c-4-2-5-7-2-10s8-3 11 0 2 8-2 10-5 2-7 0Z"/><circle cx="10" cy="12" r="2"/>',
  axe: '<path d="m14 3 7 3-5 6-5-2zM13 10 6 21M8 17l3 2"/>',
  pickaxe: '<path d="M3 8c5-5 13-5 18 0M12 6v15M9 21h6"/>',
  spear: '<path d="M4 20 17 7M15 3l6 0-1 6-3-2-2-4ZM3 21l4-1-3-3z"/>',
  torch: '<path d="m9 9 6 0-1 12h-4zM8 6c0-3 4-3 4-5 3 3 5 5 3 8H9c-1-1-1-2-1-3Z"/>',
  fire: '<path d="M12 22c5 0 8-3 8-7 0-5-4-7-5-11-3 2-2 5-5 7-1-2-2-3-4-4 0 4-2 5-2 8 0 4 3 7 8 7Z"/><path d="M9 18c0-2 2-3 3-5 1 2 3 3 3 5a3 3 0 0 1-6 0Z"/>',
  wall: '<path d="M3 5h18v14H3zM3 10h18M3 15h18M8 5v5M16 5v5M6 10v5M14 10v5M9 15v4M18 15v4"/>',
  gate: '<path d="M4 21V4M20 21V4M4 6h16M7 9h10v10H7zM7 10l10 8M17 10 7 18"/>',
  skull: '<path d="M5 11a7 7 0 1 1 14 0v5l-3 2v3H8v-3l-3-2z"/><circle cx="9" cy="11" r="1"/><circle cx="15" cy="11" r="1"/><path d="M12 13v3M9 18v3M15 18v3"/>',
  rotate: '<path d="M20 11a8 8 0 1 0-2 5M20 4v7h-7"/>',
  jump: '<path d="M12 20V5M6 11l6-6 6 6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
};

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.fist}</svg>`;
}

export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon);
}
