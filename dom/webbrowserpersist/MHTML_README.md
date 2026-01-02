# MHTML Support in Firefox

## Overview

Firefox now supports **MHTML (MIME HTML)** format for saving and reading web pages as single files. This implementation is compatible with Chrome's MHTML format.

## Features

### ✅ Implemented

1. **MHTML Export** (`nsWebBrowserPersist`)
   - Save web pages as `.mhtml` files
   - Multipart/related MIME format
   - Base64 encoding for binary resources
   - Quoted-Printable for text
   - Resource embedding (images, CSS, fonts, JS)
   - Script/noscript tag stripping (matches Chrome)
   - No `_files` folder created

2. **MHTML Parser** (`MHTMLParser.sys.mjs`)
   - Parse multipart/related format
   - Handle Base64 and Quoted-Printable encodings
   - Extract parts with Content-Location headers
   - Support for complex boundaries

3. **MHTML Archive** (`MHTMLArchive.sys.mjs`)
   - Resource management and lookup
   - URI resolution (absolute, relative, path-only)
   - Main document detection
   - Statistics and diagnostics
   - Chrome-compatible architecture

4. **Tests**
   - Export functionality tests
   - Parser tests
   - Archive API tests
   - Roundtrip tests (save → parse → verify)

### 🚧 Deferred (Future Work)

1. **Browser Integration**
   - MIME type detection for `.mhtml` files
   - Resource interception in nsDocShell
   - Direct file:// MHTML loading
   - UI indicators for MHTML pages

2. **File Association**
   - Register `.mhtml` with OS
   - "Open With Firefox" support
   - Double-click to open

## Usage

### Saving as MHTML

```javascript
// From contentAreaUtils.js
let persistArgs = {
  // ... standard args
  contentType: "application/mhtml",
  flags: PERSIST_FLAGS_SAVE_AS_MHTML,
  filesFolder: null, // No _files folder
};
```

Or via UI: **File → Save Page As → Web Page, single file (MHTML)**

### Reading MHTML

```javascript
const { MHTMLArchive } = ChromeUtils.importESModule(
  "resource://gre/modules/MHTMLArchive.sys.mjs"
);

// Load MHTML file
let mhtmlContent = await IOUtils.readUTF8("/path/to/file.mhtml");
let baseURI = Services.io.newFileURI(file);

// Check if it's MHTML
if (MHTMLArchive.isMHTML(mhtmlContent)) {
  // Create archive
  let archive = MHTMLArchive.create(mhtmlContent, baseURI);

  // Get main HTML
  let mainDoc = archive.getMainDocument();
  let html = mainDoc.body;

  // Get resources
  let cssResource = archive.getResource("https://example.com/style.css");
  if (cssResource) {
    let cssText = archive.parser.decodeBody(cssResource);
  }

  // Check stats
  let stats = archive.getStats();
  console.log(`Archive has ${stats.totalParts} parts`);
}
```

## Architecture

### Export Flow

```
User clicks "Save Page As MHTML"
↓
contentAreaUtils.js sets PERSIST_FLAGS_SAVE_AS_MHTML
↓
nsWebBrowserPersist::SerializeNextFile()
↓
nsWebBrowserPersist::SerializeAsMHTML()
  - Enumerate DOM (HTML, images, CSS, fonts)
  - Download resources
  - Parse CSS for @font-face
  - Collect in mHTMLResources
↓
nsMHTMLPersist::StartMHTMLArchive()
  - Write MIME headers
  - Write boundary
  - Write each resource:
    * Content-Type
    * Content-Transfer-Encoding
    * Content-Location
    * Base64/Quoted-Printable encoded body
↓
Output: single .mhtml file
```

### Parse Flow

```
Read .mhtml file
↓
MHTMLParser.parse()
  - Parse MIME headers
  - Extract boundary
  - Split into parts
  - Parse each part's headers
  - Store encoded body
↓
MHTMLArchive.create()
  - Build resource map
  - Identify main HTML document
  - Create URI lookup tables
↓
Archive ready for queries
```

## Security

### Origin Isolation

- `file://` URLs have **null origin** in Firefox
- Each file gets a **unique origin** (no same-origin access between files)
- No additional isolation needed for MHTML

### Storage Access

- `file://` origins **cannot access** localStorage/IndexedDB by default
- Cookies are **partitioned by file path**
- **No storage exploits** possible

### Network Access

- MHTML documents loaded via `file://` respect normal file:// security
- Mixed content blocking applies
- CSP can be applied if needed

## Testing

```bash
# Run all MHTML tests
./mach test toolkit/components/windowcreator/test/browser_persist_mhtml.js --headless
./mach test toolkit/components/windowcreator/test/browser_mhtml_read.js --headless

# Build after changes
./mach build

# Lint and format
./mach lint dom/webbrowserpersist/
./mach format dom/webbrowserpersist/
```

## Files

### Core Implementation

- `dom/webbrowserpersist/nsWebBrowserPersist.{h,cpp}` - Export logic
- `dom/webbrowserpersist/nsMHTMLPersist.{h,cpp}` - MIME multipart writer
- `dom/webbrowserpersist/MHTMLParser.sys.mjs` - MIME multipart parser
- `dom/webbrowserpersist/MHTMLArchive.sys.mjs` - Archive management
- `toolkit/content/contentAreaUtils.js` - UI integration

### Tests

- `toolkit/components/windowcreator/test/browser_persist_mhtml.js` - Export tests
- `toolkit/components/windowcreator/test/browser_mhtml_read.js` - Parse tests
- `toolkit/components/windowcreator/test/file_persist_simple.html` - Test page
- `toolkit/components/windowcreator/test/file_persist_fonts.html` - Font test page

### Documentation

- `dom/webbrowserpersist/MHTML_README.md` - This file
- `dom/webbrowserpersist/MHTML_ARCHITECTURE.md` - Architecture details
- `dom/webbrowserpersist/MHTML_READING.md` - Reading implementation notes

## Compatibility

### Chrome/Chromium

✅ **Fully compatible**
- Same multipart/related format
- Same encodings (Base64, Quoted-Printable)
- Same Content-Location headers
- MHTML files saved by Firefox open correctly in Chrome
- MHTML files saved by Chrome open correctly in Firefox (via MHTMLArchive API)

### Internet Explorer/Edge

⚠️ **Mostly compatible**
- IE uses slightly different MIME structure
- May have encoding differences
- Test before relying on IE-saved MHTML files

## Known Limitations

1. **No automatic file:// loading** - MHTML files must be opened via MHTMLArchive API
2. **No UI indicator** - No "Saved Page" badge in address bar
3. **No file association** - `.mhtml` not automatically associated with Firefox
4. **JavaScript stripped** - Scripts removed for security (matches Chrome)
5. **Network resources** - External CDN resources may not be captured if blocked by CORS

## Future Enhancements

1. **Direct loading** - Integrate MHTMLArchive with nsDocShell
2. **Resource interception** - Serve resources from archive automatically
3. **File association** - Register `.mhtml` with OS
4. **UI polish** - Add "Saved Page" indicator
5. **Incremental parsing** - Stream large MHTML files
6. **Compression** - Optional gzip for text resources

## References

- **RFC 2557**: MHTML specification
- **Chrome source**: `third_party/blink/renderer/core/frame/frame_serializer.cc`
- **Chrome archive**: `blink/renderer/platform/mhtml/mhtml_archive.{h,cc}`

## Questions?

See `MHTML_ARCHITECTURE.md` for technical details or ask the team.
