# MHTML Stream Converter Architecture

## Overview

Implemented a **stream converter** approach for MHTML loading, matching Chrome's architecture and avoiding macOS sandbox restrictions.

## The Problem

**Previous Approach (Failed):**
- Intercepted `.mhtml` files in `nsDocShell::DoURILoad`
- Tried to read file directly with `NS_NewLocalFileInputStream`
- **Result**: `NS_ERROR_FILE_ACCESS_DENIED` (0x80520015)
- **Cause**: Firefox's macOS sandbox blocks direct file reads from web content context

**Why CLI worked but URL bar didn't:**
- CLI: macOS grants temporary file access when passed as argument
- URL bar/File Picker: No automatic access grant, sandbox blocks read

## New Approach: Stream Converter

**Architecture (matches Chrome):**
1. User navigates to `file:///path/to/file.mhtml`
2. `nsDocShell::DoURILoad` detects `.mhtml` extension
3. Creates normal `file://` channel with `content-type: multipart/related`
4. Firefox's file:// protocol handler reads the file (✅ has sandbox permissions)
5. **Stream converter** (`MHTMLConverter.sys.mjs`) processes the stream:
   - Parses MHTML structure
   - Extracts HTML and resources
   - Rewrites URLs to `data:` URLs
   - Injects CSP for security
   - Outputs HTML stream
6. Browser displays the HTML

## Implementation

### 1. Stream Converter (`MHTMLConverter.sys.mjs`)

```javascript
export class MHTMLConverter {
  // Implements nsIStreamConverter
  asyncConvertData(aFromType, aToType, aListener, aContext)
  onDataAvailable(aRequest, aInputStream, aOffset, aCount)
  onStopRequest(aRequest, aStatusCode)
}
```

**Registered as:**
- `@mozilla.org/streamconv;1?from=multipart/related&to=text/html`
- Category: `stream-converter`

### 2. Modified `nsDocShell::LoadMHTMLFile`

**Before (485 lines of parsing code):**
```cpp
// Read file directly
NS_NewLocalFileInputStream(...) // ❌ Sandbox blocks this
// Parse MHTML
// Rewrite URLs
// Create HTML stream
```

**After (20 lines):**
```cpp
// Create normal file:// channel
NS_NewChannel(...)
// Set content-type to trigger converter
channel->SetContentType("multipart/related")
// Let file:// handler read (has permissions ✅)
// Stream converter does the rest
OpenInitializedChannel(...)
```

### 3. Registration (`components.conf`)

```python
Classes = [
    {
        'cid': '{a9e5b8c0-4f1d-4e5e-9c2d-3b4a5c6d7e8f}',
        'contract_ids': [
            '@mozilla.org/streamconv;1?from=multipart/related&to=text/html',
        ],
        'esModule': 'resource://gre/modules/MHTMLConverter.sys.mjs',
        'constructor': 'MHTMLConverter',
        'categories': {
            'stream-converter': ['multipart/related'],
        },
    },
]
```

## Benefits

### ✅ Solves Sandbox Issue
- File reading done by file:// protocol handler (has permissions)
- No direct file I/O from web content context

### ✅ Matches Chrome Architecture
- Chrome uses MIME type handler + resource interceptor
- We use stream converter (Firefox equivalent)
- Both avoid direct file reads

### ✅ Cleaner Code
- Removed 485 lines of C++ parsing code from `nsDocShell.cpp`
- Parsing logic in dedicated JS module
- Separation of concerns

### ✅ Better Security
- Stream converter runs in controlled context
- Can't be bypassed by manipulating load state
- CSP injection happens in converter

## Flow Diagram

```
User Action: file:///path/to/file.mhtml
        ↓
nsDocShell::DoURILoad (detects .mhtml)
        ↓
nsDocShell::LoadMHTMLFile
        ↓
NS_NewChannel(file://, content-type: multipart/related)
        ↓
file:// Protocol Handler (reads file - HAS PERMISSIONS ✅)
        ↓
Stream Converter Registry (multipart/related → text/html)
        ↓
MHTMLConverter.sys.mjs
  - onDataAvailable: Collect MHTML chunks
  - onStopRequest: Parse & convert
    * MHTMLParser.sys.mjs parses structure
    * Extract HTML + resources
    * Build resource map (URL → data: URL)
    * Rewrite src/href attributes
    * Inject CSP
    * Output HTML stream
        ↓
Browser displays HTML
```

## Testing

**Test with URL bar:**
```bash
./mach run
# Type in URL bar: file:///tmp/test.mhtml
```

**Expected console output:**
```
MHTML: Detected .mhtml file in DoURILoad
MHTML: LoadMHTMLFile called - using stream converter approach
MHTML: Created channel with multipart/related content-type
MHTML Converter: asyncConvertData from=multipart/related to=text/html
MHTML Converter: onDataAvailable count=...
MHTML Converter: onStopRequest
MHTML Converter: Parsed N parts
MHTML Converter: Found HTML part
MHTML Converter: Final HTML length=...
```

**No more:**
```
❌ NS_NewLocalFileInputStream failed with rv=0x80520015
❌ access to this file was denied
```

## Comparison with Chrome

| Aspect | Chrome | Firefox (New) |
|--------|--------|---------------|
| Detection | MIME sniffing | File extension |
| File Reading | file:// handler | file:// handler ✅ |
| Processing | MIME handler | Stream converter ✅ |
| Resource Loading | Interceptor | URL rewriting ✅ |
| Security | Opaque origin | file:// principal + CSP ✅ |

## Files Modified

1. **`dom/webbrowserpersist/MHTMLConverter.sys.mjs`** (NEW)
   - Stream converter implementation
   - ~250 lines

2. **`dom/webbrowserpersist/components.conf`** (NEW)
   - XPCOM registration

3. **`dom/webbrowserpersist/moz.build`**
   - Added `MHTMLConverter.sys.mjs`
   - Added `components.conf`

4. **`docshell/base/nsDocShell.cpp`**
   - Simplified `LoadMHTMLFile` (485 lines → 20 lines)
   - Removed direct file reading
   - Removed MHTML parsing
   - Removed URL rewriting

5. **`dom/webbrowserpersist/MHTMLParser.sys.mjs`** (Existing)
   - Reused by converter

## Next Steps

1. ✅ Build and test
2. Remove debug logging
3. Add converter unit tests
4. Update documentation
5. Performance testing with large MHTML files

## Related Documentation

- [FILE_ACCESS_FIX.md](./FILE_ACCESS_FIX.md) - Previous attempt (failed)
- [CRASH_FIX.md](./CRASH_FIX.md) - Principal-related crash fix
- [CID_SUPPORT.md](./CID_SUPPORT.md) - Content-ID implementation
- [STATUS.md](./STATUS.md) - Overall status

