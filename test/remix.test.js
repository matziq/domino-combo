// @vitest-environment jsdom
import './setup.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
const bodyInner = html
  .replace(/[\s\S]*<body>/i, '')
  .replace(/<\/body>[\s\S]*/i, '')
  .replace(/<script[\s\S]*?<\/script>/gi, '');

afterEach(() => {
  vi.doUnmock('../src/logic.js');
  vi.useRealTimers();
});

describe('remix turn resolution', () => {
  it('waits for remix resolution and spawns a single when only isolated spaces remain', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    let findGroupCalls = 0;

    vi.doMock('../src/logic.js', async (importOriginal) => {
      const logic = await importOriginal();
      return {
        ...logic,
        findGroups: () =>
          findGroupCalls++ === 0
            ? [
                {
                  val: 1,
                  cells: [0, 1, 2, 3, 4].map((c) => ({ r: 0, c })),
                },
              ]
            : [],
        scrambleBoard: () =>
          Array.from({ length: 5 }, (_, r) =>
            Array.from({ length: 5 }, (_, c) => ((r + c) % 2 === 0 ? 1 : null)),
          ),
      };
    });

    document.body.innerHTML = bodyInner;
    vi.resetModules();
    await import('../src/main.js');

    const board = document.getElementById('board');
    board.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 300,
      height: 300,
    });

    const dispatchPointer = (target, type, clientX, clientY) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        clientX: { value: clientX },
        clientY: { value: clientY },
      });
      target.dispatchEvent(event);
    };

    dispatchPointer(document.getElementById('current-piece'), 'pointerdown', 40, 40);
    dispatchPointer(document, 'pointermove', 50, 50);
    dispatchPointer(document, 'pointerup', 40, 40);
    await vi.advanceTimersByTimeAsync(790);

    expect(document.querySelectorAll('#current-piece .piece-die')).toHaveLength(2);
    expect(document.getElementById('btn-remix').disabled).toBe(false);

    document.getElementById('btn-remix').click();

    expect(document.getElementById('current-piece')).toBeNull();
    await vi.advanceTimersByTimeAsync(349);
    expect(document.getElementById('current-piece')).toBeNull();

    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelectorAll('#current-piece .piece-die')).toHaveLength(1);
    expect(document.getElementById('game-over').classList.contains('show')).toBe(false);
  });
});
