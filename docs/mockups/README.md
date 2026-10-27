# Form mockups — moved

The four HTML form mockups now live in `public/mockups/` so they can be opened
from any device during the defense:

| Mockup | URL |
| --- | --- |
| Intraoral tooth chart | `/mockups/index.html` |
| Patient intake & medical history | `/mockups/intake-form.html` |
| Informed consent | `/mockups/informed-consent.html` |
| Treatment record | `/mockups/treatment-record.html` |

They are static, self-contained HTML — inline CSS, relative links, no build
step and no database connection. Every page carries `(DEMO)` in its title and
a "not connected to the database" banner, and they contain placeholder data
only.

`/mockups` is in `PUBLIC_PATHS` in `proxy.ts`, so these pages stay reachable
without a staff session. They are the only public files besides `/login` and
`/book`.

## Editing them

The working copy is kept outside the repo and copied in, so the two never
drift:

```bash
# edit in the working copy
$EDITOR ~/Downloads/gdcmas-demo/index.html

# then publish
cp ~/Downloads/gdcmas-demo/*.html public/mockups/
```
