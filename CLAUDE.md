# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla Tetris implementation: no dependencies, no build step, no package.json. Three files: `index.html` (DOM/canvas), `style.css` (dark/retro theme), `game.js` (all game logic, ~300 lines).

## Running / testing

No build or test tooling exists. To run the game, open `index.html` directly or serve statically, e.g.:

```bash
python3 -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000`. Verify changes by manually playing in a browser (move/rotate/drop pieces, clear lines, trigger game over, pause).

## Architecture

Everything lives in `game.js`, driven by a `requestAnimationFrame` loop (`loop()`), and communicates through a handful of module-level globals (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, etc.) rather than a class or state object.

- **Board model**: `ROWS × COLS` matrix; each cell is `0` (empty) or a color index `1–7` identifying which piece locked there.
- **Pieces**: defined as square matrices in `PIECES`. Rotation is done via matrix transpose+reverse in `rotateCW`, not by precomputed rotation states.
- **Collision** (`collide`): checks a shape against board bounds and locked cells.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` columns until a non-colliding position is found, else the rotation is discarded.
- **Locking a piece** (`lockPiece`): `merge()` writes the piece into `board`, `clearLines()` removes full rows (scanning bottom-up, splicing + unshifting empty rows), then `spawn()` promotes `next` to `current` and generates a new `next`; if the new piece immediately collides, `endGame()` fires.
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` multiplied by `level`; hard drop adds 2 pts/cell dropped, soft drop 1 pt/row.
- **Leveling/speed**: level = `floor(lines / 10) + 1`; `dropInterval = max(100, 1000 - (level-1) * 90)` ms.
- **Ghost piece**: `ghostY()` projects `current` straight down until collision; drawn at `globalAlpha = 0.2`.
- **Rendering**: `draw()` clears and redraws the whole board canvas every frame (grid, locked cells, ghost, current piece); `drawNext()` renders the preview canvas.
- **Input**: a single `keydown` listener switches on `e.code` (arrows, `KeyX` for rotate, `Space` for hard drop, `KeyP` for pause), guarded by `paused`/`gameOver`.

Tunable constants at the top of `game.js`: `COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, initial `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, update the `<canvas id="board">` `width`/`height` in `index.html` to match (`COLS×BLOCK` by `ROWS×BLOCK`).
