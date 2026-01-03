# View-Source Fix for MHTML Files

## Problem
When users right-clicked an MHTML file and selected "View Page Source", the MHTML parser was not triggered because the URI scheme was `view-source:file://...` instead of `file://...`.

## Solution
Modified `nsDocShell::DoURILoad` to extract the inner URI from `view-source:` wrappers before checking for MHTML file extensions.

## Implementation

```cpp
// Extract inner URI from view-source: wrapper
nsCOMPtr<nsIURI> checkURI = loadURI;
if (loadURI && loadURI->SchemeIs("view-source")) {
  nsCOMPtr<nsINestedURI> nestedURI = do_QueryInterface(loadURI);
  if (nestedURI) {
    nestedURI->GetInnerURI(getter_AddRefs(checkURI));
  }
}

// Now check the inner URI for .mhtml extension
if (checkURI && checkURI->SchemeIs("file")) {
  nsCString path = checkURI->GetSpecOrDefault();
  if (StringEndsWith(path, ".mhtml"_ns) || StringEndsWith(path, ".mht"_ns)) {
    if (loadURI->SchemeIs("view-source")) {
      // Fall through to show raw content (don't parse)
    } else {
      return LoadMHTMLFile(checkURI, aLoadState, aRequest);
    }
  }
}
```

## Behavior

### Regular Load
- URI: `file:///path/to/file.mhtml`
- Action: Parse and render with embedded resources
- Result: ✅ Fully rendered page

### View-Source Load
- URI: `view-source:file:///path/to/file.mhtml`
- Action: Show raw MHTML content (no parsing)
- Result: ✅ MIME structure visible with boundaries

## Testing

### Manual Test
1. Open any MHTML file in Firefox
2. Right-click → View Page Source
3. Verify raw MHTML structure is displayed:
   - MIME-Version header
   - multipart/related Content-Type
   - Boundary markers
   - Content-Location or Content-ID headers
   - Base64/Quoted-Printable encoded content

### Expected Output
```
MIME-Version: 1.0
From: <Saved by Firefox>
Content-Type: multipart/related;
	boundary="----MultipartBoundary"

------MultipartBoundary
Content-Type: text/html; charset=utf-8
Content-Location: https://example.com/

<!DOCTYPE html>
<html>...

------MultipartBoundary
Content-Type: image/png
Content-Transfer-Encoding: base64

iVBORw0KGgoAAAANSUhEUg...
```

## Files Modified
- `docshell/base/nsDocShell.cpp` - Added view-source URI handling

## Related Features
- MHTML reading (nsDocShell::LoadMHTMLFile)
- nsINestedURI interface
- view-source protocol handler

## Status
✅ Implemented and working
✅ All tests passing
