# Content-ID (CID) Support in MHTML Loading

## Status
✅ **CID Support Implemented and Fixed** (January 2, 2026)
- CID parsing implemented in `MHTMLParser.sys.mjs` and `nsDocShell.cpp`
- URL rewriting supports both `cid:` and `http(s)://` URIs
- Fixed crash in `nsHtml5StreamParser::DoDataAvailableBuffer` (see [CRASH_FIX.md](./CRASH_FIX.md))
- All tests passing

## Overview
Added support for Chrome/Blink-style Content-ID headers in MHTML files, improving compatibility with Chrome-generated MHTML archives.

## RFC 2557 - Two Identification Methods

MHTML (RFC 2557) supports two ways to reference embedded resources:

### 1. Content-Location (Firefox default)
```
------MultipartBoundary
Content-Type: text/css
Content-Location: https://example.com/style.css

/* CSS content */
```

HTML references:
```html
<link rel="stylesheet" href="https://example.com/style.css">
```

### 2. Content-ID (Chrome/Blink default)
```
------MultipartBoundary
Content-Type: text/css
Content-ID: <css-b8ff2cbc-0368-45e5-a43d-c712d631fc8e@mhtml.blink>

/* CSS content */
```

HTML references:
```html
<link rel="stylesheet" href="cid:css-b8ff2cbc-0368-45e5-a43d-c712d631fc8e@mhtml.blink">
```

## Implementation

### JavaScript Parser (MHTMLParser.sys.mjs)

The parser now extracts and exposes Content-ID headers:

```javascript
_parsePart(rawPart) {
  // ... parse headers ...
  
  let contentID = headers["content-id"] || null;
  
  // Clean up Content-ID (strip angle brackets per RFC 822)
  if (contentID) {
    contentID = contentID.replace(/^<|>$/g, "");
  }
  
  return {
    contentType: contentType.split(";")[0].trim(),
    contentLocation,
    contentID,  // NEW!
    encoding,
    charset,
    headers,
    body,
  };
}

// New helper method
getPartByCID(cid) {
  let cleanCID = cid.replace(/^<|>$/g, "");
  return this.parts.find(p => p.contentID === cleanCID);
}
```

### C++ Loading (nsDocShell.cpp)

#### 1. Extract Content-ID Header
```cpp
// Extract Content-ID (Chrome/Blink uses this format)
nsCString contentID;
int32_t cidStart = headers.Find("Content-ID:");
if (cidStart != kNotFound) {
  int32_t cidEnd = headers.FindChar('\n', cidStart);
  if (cidEnd != kNotFound) {
    contentID.Assign(Substring(headers, cidStart + 11, cidEnd - cidStart - 11));
    contentID.Trim(" \r\n\t<>");  // Strip angle brackets and whitespace
  }
}
```

**Note**: Content-ID values are typically wrapped in angle brackets `<...>` per RFC 822. We strip these for easier URI construction.

#### 2. Store Both Content-Location and CID Mappings
```cpp
// Store by Content-Location if present
if (!contentLocation.IsEmpty()) {
  resourceMap.InsertOrUpdate(contentLocation, dataURL);
}

// Store by cid: URI if Content-ID is present
if (!contentID.IsEmpty()) {
  nsCString cidURI = "cid:"_ns;
  cidURI.Append(contentID);
  resourceMap.InsertOrUpdate(cidURI, dataURL);
}
```

This allows resources to be looked up by either method.

#### 3. URL Rewriting
The existing URL rewriting logic already handles `cid:` URIs:
- Exact match: `cid:css-b8ff2cbc-...@mhtml.blink` → `data:text/css;base64,...`
- No special handling needed since we store full `cid:` URIs in resourceMap

## Export Behavior

**Firefox MHTML export continues to use Content-Location** for simplicity and readability:
- More human-readable URLs
- Easier debugging
- Still RFC 2557 compliant
- Chrome can read our files (it supports both methods)

## Compatibility Matrix

| Generator | Content-Location | Content-ID | Firefox Reads | Chrome Reads |
|-----------|-----------------|------------|---------------|--------------|
| Firefox   | ✅              | ❌         | ✅            | ✅           |
| Chrome    | ⚠️ Sometimes   | ✅         | ✅ (NOW!)     | ✅           |
| IE        | ✅              | ❌         | ✅            | ✅           |
| UnMHT     | ✅              | ❌         | ✅            | ✅           |

⚠️ Chrome includes Content-Location for the main HTML document but uses Content-ID for subresources

## Testing

### Test Files with CID Support
- `www_usmagazine_com-*.mhtml` - Chrome export with heavy CID usage
- CSS files referenced as `cid:css-*@mhtml.blink`
- Image files referenced as `cid:frame-*@mhtml.blink`

### Manual Test
```bash
# Open Chrome-generated MHTML with CID references
./mach run "file:///path/to/chrome-export.mhtml"

# Verify:
# 1. CSS loads correctly (no missing styles)
# 2. Images display (no broken resources)
# 3. No external network requests (check devtools)
```

## Known Edge Cases

### Duplicate Mappings
If an MHTML part has **both** Content-Location and Content-ID:
```
Content-Type: text/css
Content-Location: https://example.com/style.css
Content-ID: <css-123@mhtml.blink>
```

We store **both** mappings, so either reference will work:
- `href="https://example.com/style.css"` → Found
- `href="cid:css-123@mhtml.blink"` → Found

### Relative CID References
Some MHTML files may use relative CID references (rare):
```html
<img src="frame-ABC123">  <!-- Missing cid: prefix -->
```

Currently **not supported**. These are non-standard and uncommon.

## Future Enhancements

1. **CID Export Option** - Add pref to export using Content-ID instead of Content-Location
2. **Hybrid Mode** - Use Content-Location for main doc, Content-ID for subresources (match Chrome)
3. **CID Generation** - Implement Chrome-like CID generation algorithm for export

## References
- RFC 2557: MHTML - MIME Encapsulation of Aggregate Documents
- RFC 822: Standard for ARPA Internet Text Messages (Content-ID format)
- Chrome: `third_party/blink/renderer/core/frame/frame_serializer.cc`

