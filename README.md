# Gauntlet

An idle expedition game: recruit heroes, send a party on expeditions, and fight each
encounter live on the [Demonanic](https://github.com/demonanic/Demonanic) combat engine.

See [docs/DESIGN.md](docs/DESIGN.md) for the game loop, decisions and roadmap.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest: vendored Demonanic engine tests + Gauntlet game tests
npm run build
```

Saves live in the browser's localStorage. Use **Reset save** at the bottom of the page to
start over.
