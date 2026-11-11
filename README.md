# Domino Combo

A match-3 dice placement game. Drag dominoes onto the board, match 3+ same tiles
to merge them into the next value, and chain reactions for bonus points.

The game uses one ruleset on a fixed 5×5 board with the original piece mix.
Matching 4+ tiles collapses the board in a random direction. During a collapse
cascade, a match of 3+ causes another collapse. Matching 5+ earns a Remix Token,
and matching 4+ sixes destroys neighboring tiles. Settings retain the match
threshold and sound controls, but gameplay type, difficulty, and board size are
fixed.

## Play

- **Quick play:** run `npm run build` and open `dist/index.html` — it's a single,
  self-contained file (all CSS/JS inlined), so it works by double-clicking.
- **Dev server:** `npm run dev` and open the printed URL (module-based, with HMR).

Do not double-click the root `index.html`; it is the source entry point and
requires Vite to serve its JavaScript modules. For offline play, always use the
built `dist/index.html`.

Sound can be toggled without restarting from the switch above the board.
Full-screen mode is never automatic; use the adjacent full-screen button when
you want it.

Your active run saves locally after each move and resumes after a browser reload
or Android app restart. An interrupted chain resumes from its last complete
resolution step. New Game and game over clear the active run. Storage errors
are shown in the game; private browsing, cleared site data, and Android app
data removal can prevent or erase saves. Browser and app saves are separate.

The Music button cycles through four original synthesized loops: Funky, Pop,
Dance, and 8-bit Arcade, plus Off. The selection is saved locally. Audio starts
only after a gesture and stops when the app is backgrounded; interact with the
game to resume it. Music is independent of the sound-effects switch.
The sixes blast briefly punches the board toward the viewer; reduced-motion
settings suppress that animation.

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
| `npm run android:sync` | Build the web app and copy it into the Android project |
| `npm run android:build:debug` | Build an installable debug APK on Windows       |
| `npm run android:open` | Open the native project in Android Studio            |
| `npm run preview` | Preview the production build                          |
| `npm test`        | Run the Vitest suite once                             |
| `npm run test:watch` | Run Vitest in watch mode                            |
| `npm run lint`    | Lint with ESLint (flat config)                        |

## Android APK

The Capacitor project in `android/` packages the same production web build used
by GitHub Pages. On Windows, set `JAVA_HOME` to Android Studio's bundled JDK and
`ANDROID_HOME` to the Android SDK, then run:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = 'D:\DevTools\android-sdk'
npm run android:build:debug
```

The installable APK is written to
`android/app/build/outputs/apk/debug/app-debug.apk`.
