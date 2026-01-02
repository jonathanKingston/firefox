# MHTML Phase 2 Implementation Status

## What Was Implemented

### ✅ Extension Detection (Complete)

Added `.mhtml` file detection in `nsDocShell::DoURILoad()`:

```cpp
// In docshell/base/nsDocShell.cpp (line ~10730)
nsCOMPtr<nsIURI> loadURI = aLoadState->URI();
if (loadURI && loadURI->SchemeIs("file")) {
  nsAutoCString path;
  nsresult rv = loadURI->GetFilePath(path);
  if (NS_SUCCEEDED(rv)) {
    if (StringEndsWith(path, ".mhtml"_ns) || StringEndsWith(path, ".mht"_ns)) {
      return LoadMHTMLFile(loadURI, aLoadState);
    }
  }
}
```

**Result:** Firefox now intercepts `file:///*.mhtml` loads before normal URI loading

### ✅ Basic MHTML Loader (Complete)

Implemented `nsDocShell::LoadMHTMLFile()`:

```cpp
nsresult nsDocShell::LoadMHTMLFile(nsIURI* aURI, nsDocShellLoadState* aLoadState) {
  // 1. Get file from file:// URI
  nsCOMPtr<nsIFile> file;
  NS_GetFileFromURLSpec(aURI->GetSpecOrDefault(), getter_AddRefs(file));
  
  // 2. Read file contents
  nsCOMPtr<nsIInputStream> inputStream;
  NS_NewLocalFileInputStream(getter_AddRefs(inputStream), file);
  
  // 3. Load as HTML via input stream channel
  nsCOMPtr<nsIChannel> channel;
  NS_NewInputStreamChannel(getter_AddRefs(channel), aURI, htmlStream, ...);
  
  // 4. Open via URI loader
  uriLoader->OpenURI(channel, nsIURILoader::DONT_RETARGET, this);
}
```

**Status:** Basic file loading works, but currently just loads raw MHTML content (not yet parsed)

### ✅ Test Infrastructure (Complete)

- Created `browser_mhtml_load.js` with 3 test tasks
- Registered in `browser.toml`
- Tests compile and run (though timing out due to missing parsing)

## What's Working

1. ✅ **File detection**: `.mhtml` files are intercepted by nsDocShell
2. ✅ **File reading**: MHTML files are read from disk
3. ✅ **Channel creation**: Input stream channels are created
4. ✅ **Build system**: Everything compiles cleanly

## What's Not Working (Yet)

### 🔄 MHTML Parsing (Deferred)

Current `LoadMHTMLFile()` loads raw MHTML content instead of parsing it. Next steps:

```cpp
// TODO in LoadMHTMLFile():
//  1. Parse mhtmlContent using MHTMLArchive.sys.mjs
//  2. Extract main HTML document
//  3. Store archive on document for resource interception
```

**Why deferred:** Need to properly integrate JS module loading in C++ context

### ⏸️ Document Storage (Pending)

Need to add to `dom/base/Document.h`:

```cpp
class Document : public nsINode {
  JS::Heap<JSObject*> mMHTMLArchive;
  
public:
  bool HasMHTMLArchive() const;
  void SetMHTMLArchive(JS::Handle<JSObject*> aArchive);
  JSObject* GetMHTMLArchive();
};
```

**Blocker:** Needs GC integration for JS heap object

### ⏸️ Resource Interception (Pending)

Need to intercept subresource loads in `nsDocShell::DoChannelLoad()`:

```cpp
if (doc && doc->HasMHTMLArchive()) {
  nsCOMPtr<nsIInputStream> data;
  GetMHTMLResource(doc, uri, getter_AddRefs(data));
  if (NS_SUCCEEDED(rv)) {
    return ServeFromMemory(channel, data);
  }
}
```

**Blocker:** Depends on document storage

## Current State

### What You Can Do Now

```bash
# 1. Save a page as MHTML
Firefox → File → Save Page As → MHTML

# 2. Try to open it
# Result: Firefox intercepts the .mhtml file but shows raw MHTML source
```

### What Happens

```
User opens page.mhtml
↓
nsDocShell::DoURILoad() detects .mhtml extension ✅
↓
Calls LoadMHTMLFile() ✅
↓
Reads file from disk ✅
↓
Loads raw content (skips parsing) ⚠️
↓
Browser shows MHTML source code (multipart/related format)
```

## Next Steps

### Option A: Complete Phase 2 (Recommended)

**Effort:** ~2-3 days

1. **Add JS module loading in LoadMHTMLFile()**
   ```cpp
   // Use ChromeUtils or similar to call MHTMLArchive.create()
   AutoJSAPI jsapi;
   // Import resource://gre/modules/MHTMLArchive.sys.mjs
   // Call MHTMLArchive.create(mhtmlContent, uri)
   // Extract main HTML
   ```

2. **Add Document::mMHTMLArchive storage**
   - Add member to Document class
   - Handle GC rooting
   - Add accessors

3. **Implement resource interception**
   - Hook into channel loading
   - Query archive for resources
   - Serve from memory

4. **Fix tests**
   - Should pass once parsing is implemented

### Option B: Ship As-Is (Not Recommended)

**What works:**
- MHTML export ✅
- MHTML parsing API ✅
- File detection hook ✅

**What doesn't:**
- Opening `.mhtml` files (shows source)
- Resource loading from archives

**Use case:** Export-only, manual parsing via console

## Files Modified

### C++ Files
- `docshell/base/nsDocShell.h` - Added `LoadMHTMLFile()` declaration
- `docshell/base/nsDocShell.cpp` - Added detection + basic loader (~60 lines)

### Test Files
- `toolkit/components/windowcreator/test/browser_mhtml_load.js` - Integration tests
- `toolkit/components/windowcreator/test/browser.toml` - Test registration

### Documentation
- `dom/webbrowserpersist/MHTML_BROWSER_INTEGRATION.md` - Integration plan
- `dom/webbrowserpersist/MHTML_IMPLEMENTATION_PHASES.md` - Phase breakdown
- `dom/webbrowserpersist/MHTML_PHASE2_STATUS.md` - This file

## Recommendation

**Complete Phase 2 parsing integration** to make `.mhtml` file opening fully functional. The infrastructure is in place; just needs:

1. JS→C++ glue for MHTMLArchive
2. Document storage
3. Resource interception

Estimated: **2-3 days work** for complete Phase 2 functionality.

---

**Current commit is a good checkpoint** - extension detection and basic loading infrastructure complete.

