# Brush the Cat

A small browser game starring Wanda. Brush her, watch her expression, and know when to stop.

## Run locally

```sh
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000. Drag across the cat or hold Space to brush. Release to let her calm down.

## Project

- `dist/index.html`: page and interface
- `dist/style.css`: styles
- `dist/game.js`: brushing, loose hairs, sound, and head-only bite animation
- `dist/assets/cat-states.png`: Wanda's three poses

No dependencies or build step are required.

## Deployment

Use the existing Vercel project `hmemcpy/brush-the-cat`, serving `dist`.
Production URL: https://brush-the-cat.vercel.app

Connect this repository to that existing project's Git integration for automatic deployments from `main`. Do not create another Vercel project.
