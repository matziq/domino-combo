// @vitest-environment jsdom
import './setup.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
// Grab everything inside <body> … </body>, minus the module <script> tag.
const bodyInner = html
  .replace(/[\s\S]*<body>/i, '')
  .replace(/<\/body>[\s\S]*/i, '')
  .replace(/<script[\s\S]*?<\/script>/gi, '');

describe('game bootstrap (jsdom)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = bodyInner;
    vi.resetModules();
  });

  async function start(mode = 'ultra') {
    await import('../src/main.js');
    document.querySelector(`[data-mode="${mode}"]`).click();
  }

  it('presents all three modes before starting the game', async () => {
    await import('../src/main.js');

    expect(document.getElementById('mode-select').classList.contains('show')).toBe(true);
    expect(document.querySelectorAll('.mode-card')).toHaveLength(3);
    expect(document.querySelectorAll('#board .cell')).toHaveLength(0);
  });

  it('starts Ultimate Chaos with a full 5x5 board', async () => {
    await start();
    const cells = document.querySelectorAll('#board .cell');
    expect(cells).toHaveLength(25);
    expect(document.getElementById('score-display').textContent).toBe('0');
    expect(document.getElementById('current-piece')).not.toBeNull();
    expect(document.getElementById('mode-display').textContent).toContain('Ultimate Chaos');
    expect(document.getElementById('game').getAttribute('aria-hidden')).toBe('false');
  });

  it('returns to mode selection when New Game is clicked', async () => {
    await start();
    document.getElementById('btn-new-game').click();
    expect(document.getElementById('mode-select').classList.contains('show')).toBe(true);
    expect(document.querySelectorAll('#board .cell')).toHaveLength(0);
  });

  it('opens the help modal via its button', async () => {
    await start();
    const help = document.getElementById('help-modal');
    expect(help.classList.contains('show')).toBe(false);
    document.getElementById('btn-help').click();
    expect(help.classList.contains('show')).toBe(true);
  });

  it('applies settings to resize the board', async () => {
    await start();
    document.getElementById('opt-size').value = '7';
    document.getElementById('btn-apply-settings').click();
    expect(document.querySelectorAll('#board .cell')).toHaveLength(49);
  });

  it('starts the selected mode from the launch screen', async () => {
    await start('classic');
    expect(document.getElementById('mode-display').textContent).toContain('Classic');
  });

  it('toggles sound from the board without restarting the game', async () => {
    await start();
    const pieceBefore = document.getElementById('current-piece');
    const soundButton = document.getElementById('btn-sound');

    soundButton.click();

    expect(soundButton.getAttribute('aria-checked')).toBe('false');
    expect(document.getElementById('current-piece')).toBe(pieceBefore);
  });

  it('preserves the game when only sound changes in Settings', async () => {
    await start();
    const pieceBefore = document.getElementById('current-piece');
    document.getElementById('opt-sound').value = '0';

    document.getElementById('btn-apply-settings').click();

    expect(document.getElementById('current-piece')).toBe(pieceBefore);
    expect(document.getElementById('btn-sound').getAttribute('aria-checked')).toBe('false');
  });

  it('requests full screen only from the dedicated button', async () => {
    const requestFullscreen = vi.fn().mockResolvedValue();
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });

    try {
      await start();
      document.getElementById('btn-help').click();
      expect(requestFullscreen).not.toHaveBeenCalled();

      document.getElementById('btn-fullscreen').click();
      await vi.waitFor(() => expect(requestFullscreen).toHaveBeenCalledOnce());
    } finally {
      delete document.documentElement.requestFullscreen;
    }
  });
});
