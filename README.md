# NMS Alphabet Translator

**Live:** [translator.nomansskyhub.app](https://translator.nomansskyhub.app)

Write in the alien alphabet of *No Man's Sky*, decode it back to English, or read a portal address straight from a screenshot. Free, no account, and it installs as an app on phones and desktops.

Part of the [No Man's Sky Hub](https://nomansskyhub.app) family of fan tools.

![NMS Alphabet Translator home screen](screenshots/01-home.jpg)

## What it does

- **Text to NMS font.** Type and see your words rendered live in the alien alphabet, then copy them.
- **NMS font to text.** Tap glyph tiles to build a word and read it back in English.
- **Seven languages.** English, Español, Français, Deutsch, Português, 中文 and Русский. Accented and non-Latin text is converted to A–Z automatically.
- **Portal glyph reader.** Drop, paste or pick a screenshot showing the 12 portal glyphs in a row (photo mode, a discovery page, a Reddit post), or tap **Scan with camera** and point your phone at the screen: like a bank-card scanner it reads the live picture and fills the glyphs in by itself once every box agrees over several camera frames. The camera view shows 12 boxes: line up one glyph in each box and every box is read on its own, so glyphs that touch are kept apart. If the picture also shows the galaxy (for example "GALAXY 1. Euclid" on the Map's keypad), the galaxy is read and set too. The game's own boxed glyph bar works too. It finds the row, matches each glyph against the 16 portal glyph shapes, and marks any it isn't sure of in amber so you can tap to fix them. Then open the address on the [Galactic Map](https://map.nomansskyhub.app) or dial it on the Hub. Everything runs in your browser; the image is never uploaded (reading the galaxy name downloads a small text-reading engine the first time, but the picture stays on your device). If it can't find the row, drag a box around the glyphs. You can also just tap the glyphs in on the keypad.
- **Reference chart.** Every letter, digit, period and colon side by side with its glyph. It opens on your first keystroke and folds away when you clear the box.
- **Installable app** that also works offline.
- **Calm mode.** A small **Calm** switch in the bottom-left corner swaps the patterned and image backgrounds for a plain dark one, for anyone who finds the page busy. It's shared across the whole No Man's Sky Hub family (one switch turns it on for every site) and lives in `calm.js`.

![Live translation with the alphabet reference chart open](screenshots/02-translate-and-chart.jpg)

![Portal glyph reader: a phone photo of the Galactic Map keypad read as 101BE646D310, galaxy Calypso](screenshots/03-portal-glyph-reader.jpg)

<img src="screenshots/04-camera-scan.jpg" alt="Scan with camera: line up one glyph in each of the 12 boxes" width="300">

## How it's built

A plain HTML/CSS/JavaScript site with no build step. Deployed on Netlify straight from this repo: every push to `main` goes live.

| File | What it is |
|---|---|
| `index.html` | The translator: layout, logic and the embedded alphabet font |
| `hub-skin.css`, `hub-skin.js` | The No Man's Sky Hub look: fonts, atmosphere, glyph header, panels |
| `glyph-reader.js`, `glyph-reader.css` | Portal glyph reader: finds the 12-glyph row, matches shapes, keypad and links to the Map/Hub |
| `glyphs/`, `galaxies.json` | The 16 portal glyph images (also the matching templates) and the 256 galaxy names |
| `sw.js` | Service worker for offline use |
| `manifest.json`, `pwa/` | App install details and icons |
| `alphabet-translator-404.html` | Not-found page |

## Credits

- NMS Alphabet font by seontonppa (built with FontStruct), used with permission

## Licence

The code is MIT licensed (see `LICENSE`). Game names and imagery belong to Hello Games and are not covered by that licence.

*An unofficial, fan-made project. Not affiliated with, sponsored by, or endorsed by Hello Games.*

Built by elegra1965.
