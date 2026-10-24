# rohit.gupta: portfolio

A static Astro site. The home page is a particle "token galaxy" that reshapes into each project as you scroll; `/work` is a plain, fast overview for recruiters; `/projects/*` are case studies.

## Run

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static output in dist/
npm run preview    # serve dist/ locally
```

## Where things live

| What | File |
|---|---|
| Profile, links, experience, project cards, skills | `src/data/site.js` |
| Home page sections (text next to each particle shape) | `src/pages/index.astro` |
| Particle engine and the shapes (name, eval bars, sphere, hash ring, Kafka, SAY HI) | `src/scripts/galaxy.js` |
| Case studies (Markdown) | `src/pages/projects/*.md` |
| Classic view | `src/pages/work.astro` |
| Share image, screenshots, demo video | `public/` |

The split-layout media query appears in both `galaxy.js` (`SPLIT_MQ`) and `index.astro`; change them together.

## Devices

- Particle count scales with screen area and CPU cores, and drops automatically if frames stay slow.
- Phones and portrait tablets stack the shape above the text; desktops and landscape screens put them side by side.
- Touch: long-press anywhere (or the "Hold me" button) for the black hole; the custom cursor only appears with a mouse.
- `prefers-reduced-motion` turns off trails and drifting; JavaScript-off visitors still get every word.

## Deploy

Any static host works. On Vercel or Netlify: import the repo, framework "Astro", build `npm run build`, output `dist`.
Update `site` in `astro.config.mjs` to the real domain so canonical and share-preview URLs are correct.
