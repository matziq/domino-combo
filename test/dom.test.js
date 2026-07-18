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

  it('renders a full 5x5 board and spawns a piece on load', async () => {
    await import('../src/main.js');

    const cells = document.querySelectorAll('#board .cell');
    expect(cells).toHaveLength(25);
    expect(document.getElementById('score-display').textContent).toBe('0');
    expect(document.getElementById('current-piece')).not.toBeNull();
  });

  it('resets the board when New Game is clicked', async () => {
    await import('../src/main.js');
    document.getElementById('btn-new-game').click();
    expect(document.querySelectorAll('#board .cell')).toHaveLength(25);
    expect(document.getElementById('score-display').textContent).toBe('0');
  });

  it('opens the help modal via its button', async () => {
    await import('../src/main.js');
    const help = document.getElementById('help-modal');
    expect(help.classList.contains('show')).toBe(false);
    document.getElementById('btn-help').click();
    expect(help.classList.contains('show')).toBe(true);
  });

  it('applies settings to resize the board', async () => {
    await import('../src/main.js');
    document.getElementById('opt-size').value = '7';
    document.getElementById('btn-apply-settings').click();
    expect(document.querySelectorAll('#board .cell')).toHaveLength(49);
  });

  it('shows the Ultra Chaos mode badge once selected in settings', async () => {
    await import('../src/main.js');
    document.getElementById('opt-mode').value = 'ultra';
    document.getElementById('btn-apply-settings').click();
    expect(document.getElementById('mode-display').textContent).toContain('Ultra Chaos');
  });
});
