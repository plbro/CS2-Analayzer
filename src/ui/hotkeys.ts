/**
 * Keyboard shortcuts. The list drives both the Hotkeys window (H) and the key handler,
 * so a shortcut can't be shown without working or work without being shown.
 */
export type ActionId =
  | 'hotkeys' | 'playPause' | 'seekBack' | 'seekForward' | 'speedUp' | 'speedDown'
  | 'prevRound' | 'nextRound' | 'draw' | 'penBack' | 'move' | 'clear' | 'layer' | 'freeze' | 'escape';

export interface Hotkey { action: ActionId; keys: string[]; title: string; help: string; feature?: 'drawing' }

export const HOTKEYS: Hotkey[] = [
  { action: 'hotkeys', keys: ['H'], title: 'Show hotkeys', help: 'Opens this window.' },
  { action: 'playPause', keys: ['Space'], title: 'Play / pause', help: 'Plays or pauses the round.' },
  { action: 'seekBack', keys: ['←'], title: 'Timeline', help: '← / → move the timeline. Hold Shift for smaller steps, Ctrl for precise steps.' },
  { action: 'seekForward', keys: ['→'], title: '', help: '' },
  { action: 'speedUp', keys: ['Shift', '↑'], title: 'Playback speed', help: 'Shift + ↑ / ↓ change the speed.' },
  { action: 'speedDown', keys: ['Shift', '↓'], title: '', help: '' },
  { action: 'prevRound', keys: ['J'], title: 'Rounds', help: 'J / K jump to the previous / next round.' },
  { action: 'nextRound', keys: ['K'], title: '', help: '' },
  { action: 'draw', keys: ['D'], title: 'Drawing mode', help: 'D starts drawing; press D or Shift+D again to change colour.', feature: 'drawing' },
  { action: 'penBack', keys: ['Shift', 'D'], title: '', help: '', feature: 'drawing' },
  { action: 'move', keys: ['M'], title: 'Moving mode', help: 'M goes back to moving the map (drag to pan, scroll to zoom, double-click to reset).' },
  { action: 'clear', keys: ['C'], title: 'Clear drawings', help: 'C removes everything you drew.', feature: 'drawing' },
  { action: 'layer', keys: ['L'], title: 'Toggle level', help: 'On Nuke, Vertigo and Train with level split off, L switches upper / lower.' },
  { action: 'freeze', keys: ['F'], title: 'Freeze time', help: 'F shows or hides freeze time at the start of each round.' },
  { action: 'escape', keys: ['Esc'], title: '', help: '' },
];

/** Which action a key press means, or null. Pure. */
export function actionFor(e: { key: string; code: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): ActionId | null {
  if (e.metaKey || e.altKey) return null;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.code === 'Space') return 'playPause';
  if (k === 'ArrowLeft') return 'seekBack';
  if (k === 'ArrowRight') return 'seekForward';
  if (k === 'ArrowUp' && e.shiftKey) return 'speedUp';
  if (k === 'ArrowDown' && e.shiftKey) return 'speedDown';
  if (e.ctrlKey) return null;
  switch (k) {
    case 'h': return 'hotkeys';
    case 'j': return 'prevRound';
    case 'k': return 'nextRound';
    case 'd': return e.shiftKey ? 'penBack' : 'draw';
    case 'm': return 'move';
    case 'c': return 'clear';
    case 'l': return 'layer';
    case 'f': return 'freeze';
    case 'Escape': return 'escape';
  }
  return null;
}
