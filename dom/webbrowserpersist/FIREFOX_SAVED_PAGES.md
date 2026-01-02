# How Firefox Loads Saved Pages (Current Behavior)

## Current Multi-File Approach

When you save a page as "Web Page, complete", Firefox creates:
```
page.html
page_files/
  ├── image1.jpg
  ├── style.css
  └── script.js
```

## How Resources Load

### 1. During Save (nsWebBrowserPersist)

**URL Rewriting:**
```cpp
// Original HTML:
<img src="https://example.com/logo.png">

// Saved HTML (rewritten by nsIDocumentEncoder):
<img src="page_files/logo.png">
```

**Key Functions:**
- `nsWebBrowserPersist::SaveDocumentInternal()` - Orchestrates save
- `nsIDocumentEncoder` - Serializes DOM with URL rewriting
- `OnWalkDOMNode()` - Discovers resources during DOM traversal
- Downloads each resource to `_files/` folder
- Encoder automatically rewrites URLs to relative paths

### 2. During Load (Standard File Loading)

**No Special Handling Required:**

```
User opens: file:///Users/me/page.html
↓
Browser loads: file:///Users/me/page.html
↓
HTML contains: <img src="page_files/logo.png">
↓
Browser resolves relative URL:
  base: file:///Users/me/page.html
  relative: page_files/logo.png
  result: file:///Users/me/page_files/logo.png
↓
Standard file:// channel loads the image
```

**It Just Works™** because:
- HTML uses standard relative URLs
- Browser's normal URL resolution handles it
- file:// protocol loads local files
- No special interception needed

## Why This Works Seamlessly

### Browser's Built-in Behavior

1. **HTML parsing** sets document base URI to `file:///path/to/page.html`
2. **Relative URL resolution** is standard (RFC 3986)
3. **file:// protocol** loads local files without special handling
4. **Same-origin policy** applies (each file:// has unique origin)

### No Special Code Paths

The saved HTML is just a **normal HTML file with relative links**:
```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="page_files/style.css">
</head>
<body>
  <img src="page_files/logo.png">
  <script src="page_files/script.js"></script>
</body>
</html>
```

When you open it, Firefox doesn't know or care that it's a "saved page" - it's just HTML with file:// URLs.

## Comparison: MHTML Approach

### Multi-File (Current)

**Pros:**
- ✅ **Zero special loading code** - uses standard file:// channels
- ✅ Works with any browser
- ✅ Resources can be edited individually
- ✅ Transparent - just HTML + files

**Cons:**
- ❌ Multiple files to manage
- ❌ Can break if files separated
- ❌ Folders can be large

### MHTML (Single File)

**Pros:**
- ✅ Single file - easy to share/archive
- ✅ Can't accidentally separate resources
- ✅ Compact (no folder overhead)

**Cons:**
- ❌ **Requires special loading code** (what we're building)
- ❌ Resources embedded (can't edit individually)
- ❌ Need to parse/decode MIME structure

## Why MHTML Needs Resource Interception

### The Problem

MHTML file contains:
```
------boundary----
Content-Type: text/html
<img src="https://example.com/logo.png">
------boundary----
Content-Type: image/png
Content-Location: https://example.com/logo.png
<binary data>
------boundary------
```

**We load the HTML, which tries to fetch:**
```
https://example.com/logo.png  ← Goes to network!
```

**But the image is embedded in the MHTML file** (Base64, after second boundary).

### Solutions

**Option 1: URL Rewriting (What Chrome Does)**
```
Parse MHTML → Extract HTML → Rewrite all URLs to data: URLs
<img src="https://example.com/logo.png">
↓
<img src="data:image/png;base64,iVBORw0...">
```

**Option 2: Channel Interception (Alternative)**
```
Load HTML as-is
<img src="https://example.com/logo.png">
↓
Browser tries to fetch → Intercept in nsDocShell
↓
Check if document has MHTML archive
↓
Serve from archive instead of network
```

**Option 3: Service Worker (Future)**
```javascript
// MHTML-specific service worker
self.addEventListener('fetch', e => {
  if (document.mhtmlArchive.has(e.request.url)) {
    e.respondWith(document.mhtmlArchive.get(e.request.url));
  }
});
```

## Current Implementation Choice

**Our Phase 2 Implementation:**
- ✅ Parse MHTML structure
- ✅ Extract main HTML
- ✅ Render HTML (without rewrites)
- ⏸️ Resources don't load (no interception yet)

**Works for:** Text-heavy documents (RFCs, articles)
**Doesn't work for:** Image-heavy pages

## Next Steps for Full Resource Support

Choose one approach:

### A. Data URL Rewriting (Simpler)
```cpp
// In LoadMHTMLFile():
Parse MHTML → Extract all resources
Rewrite <img src="..."> to data: URLs
Load rewritten HTML
```
- Effort: ~1 day
- Memory: High (all resources as data: URLs)
- Compatibility: Works everywhere

### B. Channel Interception (Cleaner)
```cpp
// In nsDocShell::DoChannelLoad():
if (document->HasMHTMLArchive()) {
  ServeFromArchive(uri);
}
```
- Effort: ~2-3 days
- Memory: Efficient (lazy loading)
- Compatibility: Firefox-specific

---

**Key Insight:** Multi-file saves "just work" because they use standard HTML with relative URLs. MHTML needs special handling because resources are embedded in the archive, not referenced by file:// URLs.

