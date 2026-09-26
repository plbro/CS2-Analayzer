/**
 * Weapon data. Inventory names come from the demo exactly as the game writes them
 * (e.g. "AK-47", "USP-S"). Kill events use short codes (e.g. "ak47", "usp_silencer").
 * Add a new weapon by adding one line to the right list.
 */

/** Grenades and gear as they appear in a player's inventory → our utility id. */
export const INVENTORY_UTILITY: Record<string, UtilityId> = {
  'Smoke Grenade': 'smoke',
  Flashbang: 'flash',
  'High Explosive Grenade': 'he',
  Molotov: 'molotov',
  'Incendiary Grenade': 'molotov',
  'Decoy Grenade': 'decoy',
};
export type UtilityId = 'smoke' | 'flash' | 'he' | 'molotov' | 'decoy';
export const UTILITY_ORDER: UtilityId[] = ['molotov', 'flash', 'smoke', 'decoy', 'he'];
export const UTILITY_LABEL: Record<UtilityId, string> = {
  smoke: 'Smoke', flash: 'Flashbang', he: 'HE grenade', molotov: 'Molotov / incendiary', decoy: 'Decoy',
};

/**
 * When a player dies without a grenade in his hand (or one he held earlier in the round), we guess his most valuable one. Most valuable first
 * (molotov/incendiary 400–500, smoke 300, HE 300, flash 200, decoy 50). Smoke vs HE cost the same; a later pickup
 * corrects the guess when someone picks it up.
 */
export const DEATH_DROP_ORDER: UtilityId[] = ['molotov', 'smoke', 'he', 'flash', 'decoy'];

export const BOMB_ITEM = 'C4 Explosive';

export const PISTOLS = new Set([
  'Glock-18', 'USP-S', 'P2000', 'P250', 'Five-SeveN', 'Tec-9', 'CZ75-Auto', 'Desert Eagle', 'Dual Berettas', 'R8 Revolver',
]);

export const PRIMARIES = new Set([
  'AK-47', 'M4A4', 'M4A1-S', 'Galil AR', 'FAMAS', 'SG 553', 'AUG', 'AWP', 'SSG 08', 'G3SG1', 'SCAR-20',
  'MAC-10', 'MP9', 'MP7', 'MP5-SD', 'UMP-45', 'P90', 'PP-Bizon',
  'Nova', 'XM1014', 'Sawed-Off', 'MAG-7', 'M249', 'Negev',
]);

/** Grenade weapon codes in "weapon_fire" events → utility id (a throw). */
export const THROW_WEAPONS: Record<string, UtilityId> = {
  weapon_smokegrenade: 'smoke',
  weapon_flashbang: 'flash',
  weapon_hegrenade: 'he',
  weapon_molotov: 'molotov',
  weapon_incgrenade: 'molotov',
  weapon_decoy: 'decoy',
};

/** Kill-event weapon codes → short display name. Unknown codes are shown as they come. */
export const KILL_WEAPON_NAMES: Record<string, string> = {
  ak47: 'AK-47', m4a1: 'M4A4', m4a1_silencer: 'M4A1-S', m4a1_silencer_off: 'M4A1-S', galilar: 'Galil AR', famas: 'FAMAS',
  sg556: 'SG 553', aug: 'AUG', awp: 'AWP', ssg08: 'SSG 08', g3sg1: 'G3SG1', scar20: 'SCAR-20',
  mac10: 'MAC-10', mp9: 'MP9', mp7: 'MP7', mp5sd: 'MP5-SD', ump45: 'UMP-45', p90: 'P90', bizon: 'PP-Bizon',
  nova: 'Nova', xm1014: 'XM1014', sawedoff: 'Sawed-Off', mag7: 'MAG-7', m249: 'M249', negev: 'Negev',
  glock: 'Glock-18', usp_silencer: 'USP-S', usp_silencer_off: 'USP-S', hkp2000: 'P2000', p250: 'P250', fiveseven: 'Five-SeveN',
  tec9: 'Tec-9', cz75a: 'CZ75', deagle: 'Deagle', elite: 'Dualies', revolver: 'R8',
  hegrenade: 'HE', inferno: 'Fire', molotov: 'Molotov', incgrenade: 'Incendiary', flashbang: 'Flash', smokegrenade: 'Smoke', decoy: 'Decoy',
  taser: 'Zeus', knife: 'Knife', knife_t: 'Knife', bayonet: 'Knife', world: 'World', planted_c4: 'Bomb',
};

export function killWeaponName(code: string): string {
  if (!code) return '—';
  if (KILL_WEAPON_NAMES[code]) return KILL_WEAPON_NAMES[code];
  if (code.startsWith('knife') || code.includes('bayonet')) return 'Knife';
  return code;
}
