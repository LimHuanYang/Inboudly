# Inboudly Documentation

Quick map of what's in here.

| File | What it's for | Who reads it |
|---|---|---|
| **`USER-GUIDE.md`** | Step-by-step setup + day-to-day usage. Assumes zero computer experience. | You (testing) · onboarding non-technical teammates · clients trying it themselves |
| **`TESTING-CHECKLIST.md`** | Tiered testing plan. Lists every external account to create, every binary to install, every page to click. | You (test sessions) · QA |
| **`PRODUCT-SPEC.md`** | The 10-year vision, phase scope, competitive matrix, feature breakdown. | Investors · partners · new engineers |
| **`ARCHITECTURE.md`** | System diagram, module table, AI stack, open-source foundations. | Engineers · CTO interviews |
| **`DEPLOYMENT.md`** | Production deploy runbook — Vercel + Railway + Supabase + Upstash + R2 + Pinecone. | DevOps · production rollout |
| **`Inboudly-Client-Deck.html`** | Self-contained sales deck. Open in any browser. Press F for fullscreen, arrow keys to navigate. | **Showing to clients** |
| **`Inboudly-Client-Deck.md`** | Same deck content in editable Marp markdown. Edit easily, export to PPTX/PDF. | Editing the deck |

---

## How to show the client deck

### Option A — Open the HTML file (zero install)

1. In File Explorer, navigate to `docs/`
2. Double-click **`Inboudly-Client-Deck.html`**
3. It opens in your default browser
4. Press **F** to enter fullscreen, **arrow keys** to navigate, **Esc** to exit
5. Press **S** to open speaker notes view (in a separate window)
6. Press **B** to black out the screen mid-presentation

You can present this directly from your laptop — the deck loads reveal.js from a CDN so it works on any computer with internet. For offline use, see "Export to PDF" below.

### Option B — Export to PDF for emailing

1. Open `Inboudly-Client-Deck.html` in **Chrome** (works best)
2. Add `?print-pdf` to the end of the URL
3. Press **Ctrl+P** → set "Destination" to "Save as PDF" → set "Layout" to "Landscape"
4. Save

### Option C — Convert to PowerPoint (.pptx)

If your client insists on a `.pptx` file, edit the source markdown and convert:

1. Install VS Code (https://code.visualstudio.com)
2. Inside VS Code, install the **Marp for VS Code** extension (free)
3. Open `Inboudly-Client-Deck.md` in VS Code
4. Click the Marp icon in the top-right of the editor → "Export slide deck" → choose `.pptx`

You'll get a real PowerPoint file you can email or upload to Google Slides.

---

## How to share Inboudly with someone testing it

Send them:
1. A link to this repo: https://github.com/LimHuanYang/Inboudly
2. The path to `docs/USER-GUIDE.md` — that's the zero-knowledge step-by-step

Tell them: *"Read the User Guide and follow Parts 1–4. Skip Part 5.5 (connecting social accounts) for now. Stop after you can sign up and generate a caption — that's enough to see if you like it."*
