# NMS Alphabet Translator

**Live:** [translator.nomansskyhub.app](https://translator.nomansskyhub.app)

Write in the alien alphabet of *No Man's Sky*, or decode it back to English. Free, no account, and it installs as an app on phones and desktops.

Part of the [No Man's Sky Hub](https://nomansskyhub.app) family of fan tools.

## What it does

- **Text to NMS font.** Type and see your words rendered live in the alien alphabet, then copy them.
- **NMS font to text.** Tap glyph tiles to build a word and read it back in English.
- **Seven languages.** English, Español, Français, Deutsch, Português, 中文 and Русский. Accented and non-Latin text is converted to A–Z automatically.
- **Reference chart.** Every letter, digit, period and colon side by side with its glyph. It opens on your first keystroke and folds away when you clear the box.
- **Installable app** that also works offline.

## How it's built

A plain HTML/CSS/JavaScript site with no build step. Deployed on Netlify straight from this repo: every push to `main` goes live.

| File | What it is |
|---|---|
| `index.html` | The translator: layout, logic and the embedded alphabet font |
| `hub-skin.css`, `hub-skin.js` | The No Man's Sky Hub look: fonts, atmosphere, glyph header, panels |
| `sw.js` | Service worker for offline use |
| `manifest.json`, `pwa/` | App install details and icons |
| `alphabet-translator-404.html` | Not-found page |

## Credits

- NMS Alphabet font by seontonppa (built with FontStruct), used with permission

## Licence

The code is MIT licensed (see `LICENSE`). Game names and imagery belong to Hello Games and are not covered by that licence.

*An unofficial, fan-made project. Not affiliated with, sponsored by, or endorsed by Hello Games.*

Built by elegra1965.
