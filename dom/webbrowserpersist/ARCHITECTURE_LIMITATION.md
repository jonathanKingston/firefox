# MHTML Reading Architecture Limitation

## Current Status

✅ **MHTML Export**: Fully working - Save Page As → MHTML creates valid files  
❌ **MHTML Import**: Not yet working for `file://` URLs

## The Problem

We tried to implement MHTML reading by intercepting in `nsDocShell::DoURILoad()`:

```cpp
if (path.endsWith(".mhtml")) {
    return LoadMHTMLFile(uri, loadState, request);
}
```

This intercepts **before** the file:// protocol handler runs, so we try to open the file ourselves with `NS_NewLocalFileInputStream()`. On macOS dev builds, this hits sandbox restrictions → `NS_ERROR_FILE_ACCESS_DENIED`.

## Why Load Types Don't Matter

Initially, we thought `LOAD_HISTORY` (session restore) worked while `LOAD_NORMAL` (URL bar) didn't. But load types are just navigation metadata - they don't grant file permissions.

The real issue: **Early intercept bypasses normal file:// permission handling.**

## Normal File Loading (Works)

```
User types file:///path/file.json
    ↓
DoURILoad creates channel
    ↓
file:// protocol handler opens file (has permissions)
    ↓
Content streams to browser
```

## Our MHTML Approach (Fails)

```
User types file:///path/file.mhtml  
    ↓
DoURILoad detects .mhtml → intercepts
    ↓
LoadMHTMLFile tries NS_NewLocalFileInputStream
    ↓
FAILS - No permission (bypassed normal handler)
```

## Attempted Fixes

### 1. Stream Converter ❌
- Registered `MHTMLConverter.sys.mjs` for `multipart/related` → `text/html`
- Set Content-Type hint on channel
- **Result**: Tab crashed (signal 11)
- **Issue**: Stream converter wasn't being triggered, or had bugs in conversion logic

### 2. Load Type Filtering ❌
- Only intercept for `LOAD_HISTORY` (session restore)
- Skip `LOAD_NORMAL` (URL bar)
- **Result**: Still failed - load types don't grant permissions

### 3. Channel-based Reading ❌
- Used `CreateAndConfigureRealChannelForLoadState()` like normal file loads
- Called `fileChannel->Open()` to get stream
- **Result**: Still `NS_ERROR_FILE_ACCESS_DENIED`

## Proper Solution: Stream Converter (Future Work)

The correct architecture (how Chrome does it):

```
User types file:///path/file.mhtml
    ↓
DoURILoad creates channel (NO intercept)
    ↓
file:// protocol opens file (has permissions)
    ↓
Stream converter detects multipart/related
    ↓
Converter processes stream → outputs HTML
    ↓
Browser displays converted content
```

**Benefits:**
- File opened by normal handler (proper permissions)
- Works for URL bar, CLI, session restore, file picker
- No special-casing needed

**Implementation Tasks:**
1. Fix `MHTMLConverter.sys.mjs` crashes
2. Ensure stream converter is triggered for file:// + .mhtml extension  
3. Handle MIME type sniffing (not all MHTML files have .mhtml extension)
4. Remove `DoURILoad` intercept

## Current Workaround

**Disabled** the `DoURILoad` intercept entirely. MHTML files loaded via `file://` URLs will:
- Show raw MHTML content (multipart/related text)
- Or trigger download/file picker

**MHTML Export still works perfectly** - this only affects reading.

## Testing

```bash
# Export (works)
1. Open any web page
2. File → Save Page As
3. Select "Web Page, single file (MHTML)"
4. Save

# Import (not working yet)
./mach run "file:///path/to/file.mhtml"  # Shows raw content or file picker
```

## References

- Chrome's approach: `blink/renderer/core/frame/frame_serializer.cc`
- Firefox stream converters: `netwerk/streamconv/`
- Sandbox discussion: `MACOS_SANDBOX_ISSUE.md`

