# macOS Sandbox Issue with MHTML File Access

## Problem

MHTML files fail to load when typed in the URL bar on macOS dev builds with error `NS_ERROR_FILE_ACCESS_DENIED (0x80520015)`.

## Root Cause

The current implementation intercepts `.mhtml` files in `nsDocShell::DoURILoad()` and calls `LoadMHTMLFile()` which tries to read the file **before** the normal `file://` loading path completes. 

The macOS sandbox blocks this early file access for security reasons. The permission check happens at the system call level (`open()`), not at the Firefox principal/load type level.

## What Works

✅ **CLI**: `./mach run "file:///path/to/file.mhtml"`
✅ **Session restore**: Reopening tabs with MHTML files
✅ **File picker**: Opening via File > Open dialog
✅ **All platforms with production builds**

## What Fails

❌ **URL bar on macOS dev builds**: Typing `file:///path/to/file.mhtml` directly

## Why Session Restore Works

Session restore uses `LoadType::LOAD_HISTORY` which has special permission handling that allows file access. However, simply changing our load type doesn't help because the permission is granted **before** our intercept point.

## Attempted Fixes

1. ❌ Changing `mLoadType` to `LOAD_HISTORY` - permission already denied
2. ❌ Changing `aLoadState->LoadType()` - permission already denied  
3. ❌ Using `nsIIOService::NewChannelFromURI()` - still denied
4. ❌ Using triggering principal instead of system principal - still denied

## Proper Solution: Stream Converter Architecture

Chrome solves this by using a **stream converter** that:
1. Lets the normal `file://` load happen (with proper permissions)
2. Detects `multipart/related` MIME type
3. Converts the stream to parse MHTML and rewrite URLs
4. Feeds the converted HTML to the document

This approach works because the file is opened by the normal file loading path which has the correct permissions.

## Implementation Plan

### Phase 1: Stream Converter (Proper Fix)
- Create `nsMHTMLStreamConverter` implementing `nsIStreamConverter`
- Register for `multipart/related` → `text/html` conversion
- Move MHTML parsing logic from `LoadMHTMLFile` to converter
- Remove early intercept in `DoURILoad`

### Phase 2: MIME Sniffing
- Add MHTML magic number detection
- Register stream converter for auto-detection

## Temporary Workarounds

For testing on macOS dev builds:
```bash
# Use CLI
./mach run "file:///tmp/test.mhtml"

# Or use file picker
# File > Open File... > Select MHTML
```

## References

- Chromium's approach: `MultipartRelatedStreamConverter` 
- Firefox multipart handling: `netwerk/streamconv/`
- File permission issues: macOS sandbox blocks early file access in dev builds

