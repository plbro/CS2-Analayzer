import { describe, expect, it } from 'vitest';
import { placeLabel } from '../../src/render/renderer';

describe('place names', () => {
  it.each([
    ['BombsiteA', 'BOMBSITE A'], ['CTSpawn', 'CT SPAWN'], ['TopofMid', 'TOP OF MID'], ['TSideUpper', 'T SIDE UPPER'], ['Middle', 'MIDDLE'], ['RoofTop', 'ROOF TOP'],
  ])('%s → %s', (a, b) => expect(placeLabel(a)).toBe(b));
});
