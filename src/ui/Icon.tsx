/** Line icons, one consistent 24px grid and stroke. Add an icon by adding one line. */
export const ICONS: Record<string, string> = {
  smoke:'<rect x="8" y="6" width="8" height="14" rx="2"/><path d="M8 10h8M8 16h8M10 3.5h4"/>',
  flash:'<rect x="8.5" y="9" width="7" height="11" rx="1.5"/><path d="M12 2v3.5M7 4l1.8 2.2M17 4l-1.8 2.2M8.5 13h7"/>',
  molotov:'<path d="M10 3h4v4l2.5 3.5V20a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-9.5L10 7z"/><path d="M12 13.5c-1.6 1.3-1.6 3.2 0 4.3 1.6-1.1 1.6-3 0-4.3z"/>',
  he:'<circle cx="11" cy="14" r="6"/><path d="M9 8V5.5h4V8M13 6.5l4-2"/>',
  decoy:'<rect x="7" y="7" width="8" height="13" rx="2"/><path d="M17.5 10.5a3 3 0 0 1 0 4M19.8 8.3a6 6 0 0 1 0 8.4"/>',
  bomb:'<rect x="4" y="8" width="16" height="10" rx="1.5"/><path d="M8 8V5h8v3M7.5 12h3M7.5 15h5M15 12h2.5v2.5H15z"/>',
  kit:'<path d="M5 9h14v10H5zM9 9V6h6v3M12 11.5v5M9.5 14h5"/>',
  armor:'<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/>',
  helmet:'<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M8.5 11.5l2.5 2.5 4.5-5"/>',
  skull:'<path d="M12 3a7 7 0 0 0-7 7c0 2.6 1.3 4.2 3 5v3.5h8V15c1.7-.8 3-2.4 3-5a7 7 0 0 0-7-7z"/><circle cx="9.3" cy="10.8" r="1.4"/><circle cx="14.7" cy="10.8" r="1.4"/><path d="M11 18.5v2.5M13 18.5v2.5"/>',
  clock:'<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  hs:'<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/>',
  play:'<path d="M8 5.5l11 6.5-11 6.5z" fill="currentColor"/>',
  pause:'<path d="M7 5.5h3.5v13H7zM13.5 5.5H17v13h-3.5z" fill="currentColor"/>',
  prev:'<path d="M15 6l-6 6 6 6"/>',
  next:'<path d="M9 6l6 6-6 6"/>',
  pen:'<path d="M4.5 19.5l1-4L16 5l3 3L8.5 18.5zM14 7l3 3"/>',
  hand:'<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7-2.5 0-4-1.2-5.5-3.5L3.8 14a1.5 1.5 0 0 1 2.4-1.8L8 14"/>',
  eraser:'<path d="M9 20h11M5 15l9-9 5 5-8 8.5H9.5z"/>',
  layers:'<path d="M12 4l9 5-9 5-9-5zM3 14l9 5 9-5"/>',
  keys:'<rect x="3" y="7" width="18" height="11" rx="2"/><path d="M7 11h1M11 11h1M15 11h1M8 14.5h8"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  reset:'<path d="M4.5 12a7.5 7.5 0 1 0 2.3-5.4M4.5 4.5v4h4"/>',
  upload:'<path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"/>',
  bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>',
  list:'<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.5M4.5 12h.5M4.5 18h.5"/>',
  chart:'<path d="M4 20V10M10 20V4M16 20v-8M21 20H3"/>',
  trophy:'<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v1.5A3.5 3.5 0 0 0 8.5 11M16 6h3v1.5A3.5 3.5 0 0 1 15.5 11M12 13v4M8.5 20h7M10 17h4"/>',
  replay:'<path d="M5 5.5v13l7-6.5zM13 5.5v13l7-6.5z"/>',
  wind:'<path d="M3 12h13a3 3 0 1 0-3-3M3 16h9a2.5 2.5 0 1 1-2.5 2.5"/>',
};

export function Icon({ name, className = 'ic', title }: { name: keyof typeof ICONS | string; className?: string; title?: string }) {
  return (
    <svg className={`${className} ic-${name}`} viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title ? <title>{title}</title> : null}
      <g dangerouslySetInnerHTML={{ __html: ICONS[name] ?? '' }} />
    </svg>
  );
}
