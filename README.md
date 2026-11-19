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
- 3D: three.js r186, MIT licence. The local WebGL renderer shares a frame number between its camera and shadow passes so moving instances upload in time for both. Its directional PCF shadow target stores depth only.
- Fonts: Lilita One, Rubik and Caveat, SIL Open Font Licence, served by Google Fonts
- Sound effects and the fanfare are generated in the browser

### Location references

The remaster models and textures are procedural. Location photographs guided the following details.

- The mill masonry, church window tracery and Waag weighing doors follow [Erfgoed Alkmaar’s mill photograph](https://www.erfgoedalkmaar.nl/monumentenkaart/molen-van-piet/), [church restoration photographs](https://www.erfgoedalkmaar.nl/nieuws/klassieke-loodgieting-tijdens-restauratie-vensters-grote-kerk/) and [Waag gallery](https://www.erfgoedalkmaar.nl/monumenten/fotogalerij-waaggebouw/).
- Waagplein paving and the carriers’ shoulder harnesses draw on the [regional tourism board’s market photograph, page 10](https://www.hartvannoordholland.nl/storage/uploads/Pers/Press%20Kit%20regio%20Ontdek%20Hart%20van%20Noord%20Holland.pdf#page=10) and the [Cheese Carriers’ Guild account of its colours](https://www.kaasmarkt.nl/en-gb/history-of-the-cheese-market/cheese-carriers).
- The canal fittings and bridge portal draw on [RouteXL’s Verdronkenoord photograph](https://commons.wikimedia.org/wiki/File:Eenhoornbrug,_Alkmaar_(27301229980).jpg) and [A. J. van der Wal’s view of the Eenhoornbrug for the Rijksdienst voor het Cultureel Erfgoed](https://commons.wikimedia.org/wiki/File:Overzicht_pakhuis_met_op_de_voorgrond_ophaalbrug_-_Alkmaar_-_20396696_-_RCE.jpg).
- The fictional motorway uses hardware visible in Marcel Israel Fotografie’s A9 photographs for Rijkswaterstaat at [Nijenburgerweg](https://open.rijkswaterstaat.nl/publish/pages/223055/overzichtsfoto_a9_vanaf_viaduct_nijenburgerweg.jpg) and [Akersloot](https://open.rijkswaterstaat.nl/publish/pages/223051/bord_afrit_11_akersloot_liggend.jpg), and in [Harry Fluks’s Kooimeer approach photographs](https://wegnummers.nl/nba/nba009n2.html#nba_009n_012x).
- The fields, drainage ditches and workshop yards on the southern approach use [spring 2026 PDOK aerial imagery](https://www.pdok.nl/-/hoge-resolutie-luchtfoto-2026-nu-beschikbaar-bij-pdok) as a visual reference (Samenwerkingsverband Beeldmateriaal, CC BY 4.0). The illustrated outskirts texture and roof layout are derived from [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL 1.0.
