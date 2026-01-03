# MHTML Loader Refactoring Proposal

## Problem

Currently, all MHTML parsing logic (~300 lines) is embedded in `nsDocShell::LoadMHTMLFile()`:
- Boundary parsing
- Multipart structure parsing
- Base64/Quoted-Printable decoding
- URL rewriting
- CSP injection

**Issues:**
- ❌ `nsDocShell.cpp` is a core component - shouldn't contain format-specific parsing
- ❌ Hard to test in isolation
- ❌ Difficult to maintain
- ❌ Doesn't follow Firefox patterns for document loaders

---

## Solution: Separate MHTML Loader Module

### Proposed Architecture

**Follow the pattern already established for MHTML Export:**

| Component | Export (Existing) | Import (Proposed) |
|-----------|-------------------|-------------------|
| **Module** | `nsMHTMLPersist` | `nsMHTMLLoader` ✅ **NEW** |
| **Header** | `nsMHTMLPersist.h` | `nsMHTMLLoader.h` ✅ **NEW** |
| **Impl** | `nsMHTMLPersist.cpp` | `nsMHTMLLoader.cpp` ✅ **NEW** |
| **Caller** | `nsWebBrowserPersist` | `nsDocShell` |
| **Purpose** | Serialize HTML → MHTML | Parse MHTML → HTML |

---

## How Other Firefox Features Do This

### Pattern 1: Separate Loader Modules

**Image Decoders** (`image/decoders/`):
```cpp
// Each format has its own decoder class
image/decoders/nsPNGDecoder.cpp
image/decoders/nsJPEGDecoder.cpp
image/decoders/nsGIFDecoder.cpp

// Called from core image loading code
imgLoader::LoadImage() {
  // Detect format, delegate to appropriate decoder
  decoder->Decode(data);
}
```

**Document Loaders** (various):
```cpp
// SVG has its own loader
dom/svg/SVGDocument.cpp

// XML has its own loader  
parser/xml/nsXMLContentSink.cpp

// PDF uses a stream converter
toolkit/components/pdfjs/
```

### Pattern 2: Stream Converters

**Used for**: Format conversion during network load

```cpp
// Examples:
netwerk/streamconv/converters/nsHTTPCompressConv.cpp  // gzip/deflate
netwerk/streamconv/converters/nsDirIndexParser.cpp    // directory listings
```

**Interface:**
```idl
interface nsIStreamConverter : nsIStreamListener {
  void convert(in nsIInputStream aFromStream,
               in string aFromType,
               in string aToType,
               in nsISupports aCtxt,
               out nsIInputStream aResultStream);
};
```

### Pattern 3: Content Handlers

**Used for**: Taking over content loading entirely

```cpp
// PDF content handler
toolkit/components/pdfjs/content/PdfjsContentHandler.sys.mjs

// Image content handler (for standalone images)
image/imgLoader.cpp
```

**Interface:**
```idl
interface nsIContentHandler {
  void handleContent(in string aContentType,
                     in nsIInterfaceRequestor aWindowContext,
                     in nsIRequest aRequest);
};
```

---

## Recommended Approach for MHTML

### Option A: Dedicated Loader Module ⭐ **RECOMMENDED**

**Why**: Mirrors existing `nsMHTMLPersist` export module

```
dom/webbrowserpersist/
├── nsMHTMLPersist.h/.cpp   ✅ Export (existing)
├── nsMHTMLLoader.h/.cpp    ✅ Import (NEW)
└── moz.build               (add nsMHTMLLoader.cpp)
```

**Usage in nsDocShell:**
```cpp
nsresult nsDocShell::LoadMHTMLFile(nsIURI* aURI, ...) {
  // Read file
  nsCString mhtmlContent;
  ReadFileToString(file, mhtmlContent);
  
  // Create loader (separate module)
  RefPtr<mozilla::MHTMLLoader> loader = 
      new mozilla::MHTMLLoader(aURI, mhtmlContent);
  
  // Parse
  nsresult rv = loader->Parse();
  NS_ENSURE_SUCCESS(rv, rv);
  
  // Get processed HTML
  nsCString html;
  rv = loader->GetMainHTML(html);
  
  // Load in browser (existing code)
  nsCOMPtr<nsIInputStream> htmlStream;
  NS_NewCStringInputStream(getter_AddRefs(htmlStream), html);
  // ... rest of loading ...
}
```

**Benefits:**
- ✅ Separates concerns (nsDocShell = loading, MHTMLLoader = parsing)
- ✅ Testable in isolation
- ✅ Consistent with `nsMHTMLPersist` pattern
- ✅ No XPCOM overhead (direct C++ class)
- ✅ Easy to maintain

**Estimated Effort:** 2-3 hours (move existing code, minimal API changes)

---

### Option B: Stream Converter

**Why**: Integrates with network loading

```cpp
// New converter
dom/webbrowserpersist/nsMHTMLStreamConverter.cpp

// Registered in components.conf
{
  cid: "{...}",
  contract_ids: ["@mozilla.org/streamconv;1?from=multipart/related&to=text/html"],
  type: "nsMHTMLStreamConverter",
}
```

**Benefits:**
- ✅ Standard Firefox pattern for format conversion
- ✅ Works with http:// MHTML files (future)
- ✅ Pluggable architecture

**Drawbacks:**
- ⚠️ More complex (XPCOM, stream handling)
- ⚠️ Overkill for file:// only
- ⚠️ Need to handle async streaming

**Estimated Effort:** 1-2 days (more complex API)

---

### Option C: Content Handler

**Why**: Take over content loading entirely

```cpp
// New handler
dom/webbrowserpersist/nsMHTMLContentHandler.cpp

// Registered in components.conf
{
  cid: "{...}",
  contract_ids: ["@mozilla.org/uriloader/content-handler;1?type=multipart/related"],
  type: "nsMHTMLContentHandler",
}
```

**Benefits:**
- ✅ Most integrated with Firefox architecture
- ✅ Works for http:// and file://
- ✅ Can register MIME type association

**Drawbacks:**
- ⚠️ Most complex (full request handling)
- ⚠️ Need to handle channel setup, progress, etc.
- ⚠️ Might interfere with existing multipart/related handling

**Estimated Effort:** 2-3 days (most complex)

---

## Proposed Refactoring Plan

### Phase 1: Extract to nsMHTMLLoader ⭐ **DO THIS**

**Goal**: Move parsing logic out of nsDocShell

1. **Create** `nsMHTMLLoader.h` ✅ (done above)
2. **Create** `nsMHTMLLoader.cpp` (move existing logic from nsDocShell)
3. **Update** `nsDocShell.cpp` to use MHTMLLoader
4. **Update** `moz.build` to compile new files
5. **Test**: Verify all existing tests still pass

**Files Changed:**
- ✅ `dom/webbrowserpersist/nsMHTMLLoader.h` (NEW)
- ✅ `dom/webbrowserpersist/nsMHTMLLoader.cpp` (NEW)
- ✅ `dom/webbrowserpersist/moz.build` (add to UNIFIED_SOURCES)
- ✅ `docshell/base/nsDocShell.cpp` (simplify LoadMHTMLFile)

**Result**: Clean separation, easier to maintain

---

### Phase 2: Add Unit Tests (Optional)

**Goal**: Test MHTMLLoader in isolation

```cpp
// New test file
dom/webbrowserpersist/test/gtest/TestMHTMLLoader.cpp

TEST(MHTMLLoader, ParseSimpleMHTML) {
  nsCString mhtml = "MIME-Version: 1.0\n...";
  RefPtr<MHTMLLoader> loader = new MHTMLLoader(uri, mhtml);
  ASSERT_TRUE(NS_SUCCEEDED(loader->Parse()));
  
  nsCString html;
  loader->GetMainHTML(html);
  ASSERT_TRUE(html.Find("<!DOCTYPE html>") != -1);
}

TEST(MHTMLLoader, DecodeQuotedPrintable) { ... }
TEST(MHTMLLoader, DecodeBase64) { ... }
TEST(MHTMLLoader, RewriteURLs) { ... }
```

**Benefit**: Faster iteration, better test coverage

---

## Code Size Comparison

### Before (Current)
```
nsDocShell.cpp:  ~15,000 lines + 300 lines MHTML logic
```

### After (Proposed)
```
nsDocShell.cpp:      ~15,000 lines + 20 lines (just call MHTMLLoader)
nsMHTMLLoader.cpp:   ~300 lines (isolated parsing logic)
```

**Net change:** 0 lines (just reorganized)

---

## Migration Path

### Step 1: Create nsMHTMLLoader.h/.cpp

**Header** (already created above):
```cpp
class MHTMLLoader {
  nsresult Parse();
  nsresult GetMainHTML(nsACString& aHTML);
  static nsresult ProcessHTML(nsACString& aHTML, ...);
};
```

**Implementation**:
- Move boundary parsing from nsDocShell
- Move multipart parsing from nsDocShell
- Move decoding from nsDocShell
- Move URL rewriting from nsDocShell
- Move CSP injection from nsDocShell

### Step 2: Simplify nsDocShell::LoadMHTMLFile

**Before** (~300 lines):
```cpp
nsresult nsDocShell::LoadMHTMLFile(nsIURI* aURI, ...) {
  // Read file (keep)
  nsCString mhtmlContent;
  ReadFileToString(file, mhtmlContent);
  
  // Parse boundary (MOVE to MHTMLLoader)
  nsCString boundary;
  int32_t boundaryStart = mhtmlContent.Find("boundary=");
  // ... 50 lines ...
  
  // Parse parts (MOVE to MHTMLLoader)
  while (partStart != kNotFound) {
    // ... 100 lines ...
  }
  
  // Decode bodies (MOVE to MHTMLLoader)
  if (encoding.EqualsLiteral("quoted-printable")) {
    // ... 50 lines ...
  }
  
  // Rewrite URLs (MOVE to MHTMLLoader)
  for each attribute {
    // ... 100 lines ...
  }
  
  // Load HTML (keep)
  NS_NewCStringInputStream(...);
  OpenInitializedChannel(...);
}
```

**After** (~20 lines):
```cpp
nsresult nsDocShell::LoadMHTMLFile(nsIURI* aURI, ...) {
  // Read file
  nsCString mhtmlContent;
  nsresult rv = ReadFileToString(file, mhtmlContent);
  NS_ENSURE_SUCCESS(rv, rv);
  
  // Parse MHTML (delegated to loader)
  RefPtr<mozilla::MHTMLLoader> loader = 
      new mozilla::MHTMLLoader(aURI, mhtmlContent);
  rv = loader->Parse();
  NS_ENSURE_SUCCESS(rv, rv);
  
  // Get processed HTML
  nsCString html;
  rv = loader->GetMainHTML(html);
  NS_ENSURE_SUCCESS(rv, rv);
  
  // Load HTML (existing code)
  nsCOMPtr<nsIInputStream> htmlStream;
  rv = NS_NewCStringInputStream(getter_AddRefs(htmlStream), html);
  NS_ENSURE_SUCCESS(rv, rv);
  
  // ... rest of channel setup (unchanged) ...
}
```

---

## Testing Strategy

### Existing Tests Still Pass ✅
All 70+ tests should continue passing:
- ✅ Export tests (unchanged)
- ✅ Parser unit tests (unchanged)
- ✅ Network isolation tests (unchanged)
- ✅ Roundtrip tests (unchanged)

### New Tests (Optional)
- Unit tests for MHTMLLoader methods
- Faster than browser tests
- Better coverage of edge cases

---

## Timeline

### Immediate (1-2 hours):
1. ✅ Create `nsMHTMLLoader.h` (DONE)
2. Create `nsMHTMLLoader.cpp` (move code from nsDocShell)
3. Update `nsDocShell.cpp` (use MHTMLLoader)
4. Update `moz.build`
5. Test: `./mach build && ./mach test`

### Follow-up (optional):
- Add gtest unit tests
- Add documentation
- Consider stream converter for http:// support

---

## Recommendation

**✅ DO THIS**: Option A (Dedicated Loader Module)

**Why:**
- ✅ Minimal effort (2-3 hours)
- ✅ Big maintainability win
- ✅ Follows existing pattern (`nsMHTMLPersist`)
- ✅ No architectural changes needed
- ✅ All existing tests continue to pass
- ✅ Easier to review (clear module boundary)

**Next Step:**
Create `nsMHTMLLoader.cpp` and move the parsing logic from `nsDocShell::LoadMHTMLFile()`.

