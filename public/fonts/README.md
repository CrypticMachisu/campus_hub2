# Bundled fonts

Anton, Archivo, IBM Plex Sans and IBM Plex Mono are bundled so the app renders
its intended typography without a network request to Google Fonts.

- `anton-400.woff2` — display headlines and numerals (single weight).
- `archivo-var.woff2` — body and UI, variable 400–700.
- `ibm-plex-mono-400/500.woff2` — times, places, counts and labels.
- `ibm-plex-sans.woff2` and `space-grotesk.woff2` are leftovers from the retired
  Corkboard theme. Nothing in `src/styles/theme.css` references them; they are
  safe to delete once no page uses them directly.

All families are licensed under the SIL Open Font License 1.1:
<https://openfontlicense.org>

The `.woff2` files here are the Latin subsets downloaded from Google Fonts. The
weights match what `src/styles/theme.css` declares.
