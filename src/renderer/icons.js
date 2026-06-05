/** Inline SVG icons (Lucide-style, stroke 2) */
const SVG_ATTR = 'xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'

const ICONS = {
  expand: `<svg ${SVG_ATTR}><path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/></svg>`,
  shrink: `<svg ${SVG_ATTR}><path d="m14 10 7-7"/><path d="M20 10h-6V4"/><path d="m3 21 7-7"/><path d="M4 14h6v6"/></svg>`,
  collapse: `<svg ${SVG_ATTR}><path d="M4 14h6v6"/><path d="m10 14-7 7"/><path d="M20 10h-6V4"/><path d="m14 10 7-7"/></svg>`,
  close: `<svg ${SVG_ATTR}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  settings: `<svg ${SVG_ATTR}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  refresh: `<svg ${SVG_ATTR}><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>`,
  chevLeft: `<svg ${SVG_ATTR}><path d="m15 18-6-6 6-6"/></svg>`,
  chevRight: `<svg ${SVG_ATTR}><path d="m9 18 6-6-6-6"/></svg>`,
  chevUp: `<svg ${SVG_ATTR}><path d="m18 15-6-6-6 6"/></svg>`,
  external: `<svg ${SVG_ATTR}><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`,
  bell: `<svg ${SVG_ATTR}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
  moon: `<svg ${SVG_ATTR}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
  link: `<svg ${SVG_ATTR}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  keyboard: `<svg ${SVG_ATTR}><rect width="20" height="16" x="2" y="4" rx="2"/><path d="M6 8h.001"/><path d="M10 8h.001"/><path d="M14 8h.001"/><path d="M18 8h.001"/><path d="M8 12h.001"/><path d="M12 12h.001"/><path d="M16 12h.001"/><path d="M7 16h10"/></svg>`,
  power: `<svg ${SVG_ATTR}><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.01"/></svg>`,
  inbox: `<svg ${SVG_ATTR}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
  target: `<svg ${SVG_ATTR}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  check: `<svg ${SVG_ATTR}><path d="M20 6 9 17l-5-5"/></svg>`,
}

function icon(name, size) {
  const s = size || 16
  const svg = ICONS[name] || ''
  return svg.replace(/width="16" height="16"/, `width="${s}" height="${s}"`)
}

function brandMark(size) {
  const s = size || 22
  const fs = Math.round(s * 0.55)
  return `<span class="brand-mark" style="width:${s}px;height:${s}px;font-size:${fs}px" aria-hidden="true">T</span>`
}

window.TbIcons = { icon, brandMark, ICONS }
