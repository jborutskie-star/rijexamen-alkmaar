# Het Rijexamen

A short 3D film: one driving exam through Alkmaar that goes slightly wrong. The driver stays a mystery until the last scene, so her name is kept out of the page title, the opening screen and the address.
Open `index.html` through any web server, or publish the folder with GitHub Pages. Add `?at=900` to the address to jump straight to that many metres into the drive.

## Checks

- `node tools/check.mjs` replays the whole drive and fails if the car touches a building, the water, a cyclist, parked car, bystander, lamppost, bench, roadworks or the fireworks stall, or leaves a bridge deck.
- `node tools/smooth.mjs` replays the drive and fails if the car's position, heading, lean or height ever jumps between two frames.
- `node tools/check-snelweg.mjs` replays the motorway scene and fails if anything touches or hides the car, or the camera ends up inside something.
- `node tools/check-landmarks.mjs` builds every landmark and prop model and fails on broken numbers, a model outside its size limits or over its triangle budget.
- `node tools/check-boats.mjs` looks down into every boat and fails if the canal water would show inside one, still or bobbing.
- In the browser console, `exam.audit()` plays the film without drawing it and lists any shot where the camera is inside or behind a building. `{}` means clean.
- `tools/sheet.sh "from=0&to=21&step=3" out.png` renders a grid of film frames with headless Chrome (add `at=900` to start in the drive), for reviewing the film without watching it. It needs the local server on port 8765 and takes a few seconds a frame.

## Credits

- Map: © OpenStreetMap contributors, Open Database Licence (https://www.openstreetmap.org/copyright)
- Music: "Tea Bag Rag", "Codename Dougwood" and "The Victory of Heroes" by Shane Ivers (https://www.silvermansound.com), CC BY 4.0, trimmed to length
- 3D: three.js, MIT licence
- Fonts: Lilita One, Rubik and Caveat, SIL Open Font Licence, served by Google Fonts
- Sound effects and the fanfare are generated in the browser
