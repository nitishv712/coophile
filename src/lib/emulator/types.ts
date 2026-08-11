export type SystemType = 'nes' | 'snes' | 'gba' | 'gb' | 'gbc' | 'genesis' | 'n64';

export interface SystemInfo {
  name: string;
  core: string;  // EmulatorJS core name
  extensions: string[];
  year: string;
  icon: string;
}

export const SYSTEMS: Record<SystemType, SystemInfo> = {
  nes: { name: 'Nintendo Entertainment System', core: 'nes', extensions: ['.nes'], year: '1983', icon: '🎮' },
  snes: { name: 'Super Nintendo', core: 'snes', extensions: ['.smc', '.sfc'], year: '1990', icon: '🕹️' },
  gba: { name: 'Game Boy Advance', core: 'gba', extensions: ['.gba'], year: '2001', icon: '📱' },
  gb: { name: 'Game Boy', core: 'gb', extensions: ['.gb'], year: '1989', icon: '🎲' },
  gbc: { name: 'Game Boy Color', core: 'gbc', extensions: ['.gbc'], year: '1998', icon: '🌈' },
  genesis: { name: 'Sega Genesis', core: 'segaMD', extensions: ['.md', '.gen', '.bin'], year: '1988', icon: '⚡' },
  n64: { name: 'Nintendo 64', core: 'n64', extensions: ['.n64', '.z64', '.v64'], year: '1996', icon: '🏠' },
};

export function detectSystem(fileName: string): SystemType | null {
  const ext = '.' + fileName.split('.').pop()?.toLowerCase();
  for (const [system, info] of Object.entries(SYSTEMS)) {
    if (info.extensions.includes(ext)) return system as SystemType;
  }
  return null;
}

export interface EmulatorConfig {
  system: SystemType;
  romUrl: string;  // blob: URL or http URL to the ROM
  pathToData?: string;  // path to EmulatorJS data files
  /**
   * Set during netplay. Decides which controller the local player's keys drive
   * and which one receives the remote player's injected input.
   */
  netplayRole?: 'host' | 'guest';
}
