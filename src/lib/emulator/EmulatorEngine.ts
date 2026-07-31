import { EmulatorConfig, SYSTEMS } from './types';
import { buildDefaultControls, loadKeyMapping } from './controls';

/**
 * The slice of the EmulatorJS runtime this app actually touches. Save states
 * are the interesting part for netplay: they are how a desynced peer resyncs.
 */
interface EmulatorJsGameManager {
  getState(): Uint8Array;
  loadState(state: Uint8Array): void;
}

interface EmulatorJsInstance {
  gameManager?: EmulatorJsGameManager;
  play(): void;
  pause(): void;
  restart(): void;
}

// EmulatorJS is configured through globals that must be set before its loader
// script runs. All optional so `destroy()` can delete them again.
declare global {
  interface Window {
    EJS_player?: string;
    EJS_core?: string;
    EJS_gameUrl?: string;
    EJS_pathtodata?: string;
    EJS_startOnLoaded?: boolean;
    EJS_gameName?: string;
    EJS_color?: string;
    EJS_emulator?: EmulatorJsInstance;
    EJS_backgroundBlur?: boolean;
    EJS_backgroundColor?: string;
    EJS_fullscreenOnLoaded?: boolean;
    EJS_defaultControls?: Record<number, Record<number, { value: string; value2?: string }>>;
  }
}

export class EmulatorEngine {
  private config: EmulatorConfig;
  private container: HTMLElement;
  private loaded: boolean = false;
  private scriptEl: HTMLScriptElement | null = null;

  constructor(container: HTMLElement, config: EmulatorConfig) {
    this.container = container;
    this.config = config;
  }

  async init(): Promise<void> {
    const systemInfo = SYSTEMS[this.config.system];
    if (!systemInfo) throw new Error(`Unknown system: ${this.config.system}`);

    const pathToData =
      this.config.pathToData || 'https://cdn.emulatorjs.org/stable/data/';

    // Set EmulatorJS global config BEFORE loading the script
    window.EJS_player = `#${this.container.id}`;
    window.EJS_core = systemInfo.core;
    window.EJS_gameUrl = this.config.romUrl;
    window.EJS_pathtodata = pathToData;
    window.EJS_startOnLoaded = true;
    window.EJS_gameName = 'Coophile Game';
    window.EJS_color = '#00f0ff';  // Match our cyan accent
    window.EJS_backgroundBlur = true;
    window.EJS_backgroundColor = '#0a0b1e';  // Match our dark bg
    // Only set this when there is an actual override: EmulatorJS's own
    // control-menu setup indexes straight into whatever is here, and leaving
    // it unset entirely is the safest way to get its own untouched defaults.
    const controls = buildDefaultControls(loadKeyMapping());
    if (controls) window.EJS_defaultControls = controls;
    else delete window.EJS_defaultControls;

    // Load EmulatorJS loader script
    return new Promise((resolve, reject) => {
      this.scriptEl = document.createElement('script');
      this.scriptEl.src = `${pathToData}loader.js`;
      this.scriptEl.async = true;
      this.scriptEl.onload = () => {
        this.loaded = true;
        resolve();
      };
      this.scriptEl.onerror = () => {
        reject(new Error('Failed to load EmulatorJS'));
      };
      document.body.appendChild(this.scriptEl);
    });
  }

  get emulator() {
    return window.EJS_emulator;
  }

  get gameManager() {
    return this.emulator?.gameManager;
  }

  play(): void {
    this.emulator?.play();
  }

  pause(): void {
    this.emulator?.pause();
  }

  reset(): void {
    this.emulator?.restart();
  }

  /**
   * Return keyboard focus to the emulator.
   *
   * EmulatorJS binds its own keydown/keyup listeners to this container (not
   * `window`), and only refocuses it on its own internal events — never in
   * response to anything in the surrounding page. Any click on our own UI
   * (fullscreen, exit, hiding the HUD) steals focus and leaves it stolen, so
   * the host page has to hand focus back explicitly.
   */
  focusGame(): void {
    this.container.focus();
  }

  /**
   * Get a save state as Uint8Array.
   * Useful for netplay resync.
   */
  getState(): Uint8Array | null {
    try {
      return this.gameManager?.getState() || null;
    } catch {
      return null;
    }
  }

  /**
   * Load a save state from Uint8Array.
   */
  setState(state: Uint8Array): void {
    try {
      this.gameManager?.loadState(state);
    } catch (e) {
      console.error('Failed to load state:', e);
    }
  }

  /**
   * Check if the emulator is loaded and running.
   */
  isLoaded(): boolean {
    return this.loaded && !!this.emulator;
  }

  /**
   * Destroy the emulator and clean up.
   */
  destroy(): void {
    // Remove the script
    if (this.scriptEl) {
      document.body.removeChild(this.scriptEl);
      this.scriptEl = null;
    }

    // Clean up EmulatorJS globals
    delete window.EJS_player;
    delete window.EJS_core;
    delete window.EJS_gameUrl;
    delete window.EJS_pathtodata;
    delete window.EJS_emulator;
    delete window.EJS_startOnLoaded;
    delete window.EJS_gameName;
    delete window.EJS_color;
    delete window.EJS_defaultControls;

    // Clear the container
    this.container.innerHTML = '';
    this.loaded = false;
  }
}
