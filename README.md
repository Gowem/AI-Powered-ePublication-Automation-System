# XMLFlow — E-Publication Automation Tool

A browser-based tool that automates XML tagging of e-publications. Upload a PDF (digital or scanned), let the tool extract and classify content blocks, review and correct the results, then export clean client-specific XML — all without a server, database, or install.

---

## Screenshots

> _Add screenshots of the Dashboard, Client Profiles editor, Review screen, and XML Output here._

---

## Features

- **PDF ingestion** — drag-and-drop or browse; supports both digital (text-layer) and scanned PDFs
- **OCR** — Tesseract.js automatically processes scanned pages in-browser
- **AI-style content classification** — blocks are auto-classified as title, heading, subheading, paragraph, list item, caption, or ignored
- **Manual review** — page-by-page preview with reclassification controls before export
- **Client profiles** — per-client tag mapping; define any XML tag name for each content type
- **Tag document import** — auto-populate a profile by uploading a Word (.docx), Excel (.xlsx), XML, or plain-text reference document in multiple formats:
  - Heading-per-tag guide docs (e.g. `<chapter>` as a Heading2)
  - Two-column tables (Label | XML Tag)
  - Key-value paragraph lines (`Title: <title>`)
- **Manual tag entry** — add, edit, or delete tag rows directly in the profile editor
- **XML export** — copy to clipboard or download as `.xml`
- **No backend** — everything runs client-side; profiles persist in `localStorage`

---

## Demo / Quick Start

### Option 1 — Windows (Recommended)

Double-click **`Start XMLFlow.bat`**.

The script checks for Python, starts a local HTTP server on port `3030`, and opens `http://localhost:3030` in your default browser. Keep the terminal window open while using the app; close it to stop the server.

**Requirement:** Python 3.x must be installed and available in `PATH`.  
Download: https://www.python.org/downloads/

### Option 2 — Any platform with Node.js

```bash
npx serve -p 3030 .
```

Then open `http://localhost:3030`.

### Option 3 — Any static file server

Serve the project root with any HTTP server. The app is three files: `index.html`, `app.js`, `style.css`.

> **Note:** The app must be served over HTTP (not opened as `file://`) because PDF.js, Tesseract.js, and the Clipboard API require a proper origin.

---

## How It Works

```
1. Upload PDF ──► 2. Process (OCR / text extract) ──► 3. Review blocks
                                                             │
                        6. Use in publishing ◄── 5. Download XML ◄── 4. Generate XML
```

| Step | What happens |
|------|-------------|
| **1 — Upload** | Select a PDF and a client profile |
| **2 — Process** | PDF.js renders each page; digital pages extract text directly; scanned pages run through Tesseract.js OCR |
| **3 — Review** | Content blocks are displayed alongside the page image; reclassify any block before export |
| **4 — Generate** | XMLFlow maps each block's type to the tag defined in the active client profile |
| **5 — Export** | Copy XML to clipboard or download as a `.xml` file |
| **6 — Profiles** | Create and manage per-client tag mappings; import from reference documents |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Markup | HTML5 |
| Logic | Vanilla JavaScript (ES6+, no framework) |
| Styling | CSS3 with custom properties |
| Rendering | Canvas API (page preview) |
| Storage | `localStorage` (profiles, stats) |
| Build | None — serve static files as-is |

### CDN Libraries

All loaded from CDN — no `npm install` required.

| Library | Version | Purpose |
|---------|---------|---------|
| [PDF.js](https://mozilla.github.io/pdf.js/) | 3.11.174 | PDF parsing and page rendering |
| [Tesseract.js](https://tesseract.projectnaptha.com/) | 5 | In-browser OCR for scanned pages |
| [Mammoth.js](https://github.com/mwilliamson/mammoth.js) | 1.6.0 | `.docx` → HTML conversion for tag doc import |
| [SheetJS (XLSX)](https://sheetjs.com/) | 0.18.5 | Excel/CSV parsing for tag doc import |
| [Inter](https://fonts.google.com/specimen/Inter) + [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) | — | UI fonts (Google Fonts) |

---

## Project Structure

```
XML PROJECT/
├── index.html          # App shell — all screens, modals, layout
├── app.js              # All application logic (~1,500 lines)
├── style.css           # UI styles and design tokens
├── Start XMLFlow.bat   # Windows one-click launcher
└── README.md
```

No build output, no `node_modules`, no config files.

---

## Client Profiles

Profiles define the XML tag name for each content type your client expects. They are stored in the browser's `localStorage`.

### Creating a profile

1. Go to **Client Profiles → New Profile**
2. Enter a client name
3. Add tag mappings manually with the **+** button, _or_ upload a reference document

### Supported reference document formats

| Format | How tags are read |
|--------|------------------|
| `.docx` — Heading guide | Each Heading (H1–H6) whose text is `<tagname>` or a bare identifier is extracted as a tag |
| `.docx` — Table | Two-column table: Column 1 = label, Column 2 = XML tag name |
| `.docx` — Paragraphs | Lines matching `Label: <tagname>` or `Label → tagname` |
| `.xlsx` / `.xls` / `.csv` | First sheet, two columns: label and tag name |
| `.xml` | `<mapping>`, `<tag>`, `<item>` elements with `type`/`name` and `tag`/`value` attributes |
| `.txt` | Tab-separated or `Label: tag` lines |

---

## Browser Requirements

| Browser | Minimum version |
|---------|----------------|
| Chrome / Edge | 90+ |
| Firefox | 88+ |
| Safari | 15+ |

JavaScript must be enabled. The app does not work when opened directly as a `file://` URL.

---

## Privacy

All processing happens **entirely in your browser**. No data, PDFs, or documents are sent to any server. Profiles are saved only in your browser's `localStorage` and are not synced anywhere.

---

## Limitations

- OCR accuracy depends on scan quality (Tesseract.js handles standard print well but may struggle with complex layouts or low-resolution scans)
- Very large PDFs (100+ pages) may be slow depending on machine specs
- Profiles are browser-local — use **Export Profile** (JSON) to back up or share them across machines
- No undo history in the review editor

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes to `index.html`, `app.js`, or `style.css`
4. Test by serving locally (see Quick Start above)
5. Open a pull request with a clear description of what changed and why

There is no test suite or build step — changes are immediately testable by refreshing the browser.

---

## License

[MIT](LICENSE)

---

## Acknowledgements

Built with:
- [PDF.js](https://mozilla.github.io/pdf.js/) by Mozilla
- [Tesseract.js](https://tesseract.projectnaptha.com/) by Project Naptha
- [Mammoth.js](https://github.com/mwilliamson/mammoth.js) by Michael Williamson
- [SheetJS](https://sheetjs.com/) by SheetJS LLC
