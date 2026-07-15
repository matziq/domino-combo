# Domino Combo

A match-3 dice placement game. Drag dominoes onto the board, match 3+ same tiles
to merge them into the next value, and chain reactions for bonus points.

## Play

- **Quick play:** run `npm run build` and open `dist/index.html` — it's a single,
  self-contained file (all CSS/JS inlined), so it works by double-clicking.
- **Dev server:** `npm run dev` and open the printed URL (module-based, with HMR).

## Project structure

```
index.html        markup + styles; loads src/main.js as a module
src/logic.js      pure, DOM-free game logic (single source of truth, unit-tested)
src/main.js       DOM rendering, audio, drag/drop, and event wiring
test/             Vitest suites (pure logic + jsdom bootstrap smoke tests)
```

## Tooling

| Command           | What it does                                          |
| ----------------- | ----------------------------------------------------- |
| `npm run dev`     | Start the Vite dev server                             |
| `npm run build`   | Build a single self-contained `dist/index.html`       |
| `npm run preview` | Preview the production build                          |
| `npm test`        | Run the Vitest suite once                             |
| `npm run test:watch` | Run Vitest in watch mode                            |
| `npm run lint`    | Lint with ESLint (flat config)                        |
