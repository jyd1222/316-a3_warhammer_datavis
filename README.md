# 316-a3_warhammer_datavis

Dark Angels themed D3 project scaffold for CSC316 A3.

## Current concept

`The Unforgiven Atlas` is now moving toward a single primary visualization:

- a chapter hierarchy map that starts with Lion El'Jonson
- branches into Deathwing, Ravenwing, and supporting command groups
- lets the viewer click nodes to inspect each unit's dossier

The current pass focuses on lore framing plus a first structural tree prototype. The next pass can refine animation, branch logic, and the visual distinction between commanders, squads, and war engines.

## Project files

- `index.html` - lore intro plus single main visualization stage
- `css/styles.css` - grim dark / Dark Angels visual system
- `js/main.js` - XML parsing, hierarchy building, D3 tree rendering
- `data/dark-angels.cat` - Dark Angels catalogue source data
- `data/abilities.csv` - previous starter dataset, kept for reference
- `assets/` - reserved for later screenshots or media

## Local preview

Because D3 fetches the XML catalogue in the browser, serve the folder through a local server:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.
