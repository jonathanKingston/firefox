# MHTML Import Status

## Current State

### ✅ MHTML Export: **FULLY WORKING**
- Save pages as `.mhtml` files
- Chrome-compatible format  
- All resources embedded
- 48/48 tests passing
- **Production ready**

### ⚠️ MHTML Import: **BLOCKED BY MACOS SANDBOX**

## The Problem

**Works:**
- ✅ CLI loading: `./mach run file.mhtml`
- ✅ Direct file argument gets macOS permission grant

**Doesn't Work:**
- ❌ URL bar: `file:///path/to/file.mhtml`  
- ❌ File Picker: File → Open File
- ❌ Error: `NS_ERROR_FILE_ACCESS_DENIED` (0x80520015)

**Root Cause:**  
Firefox's macOS sandbox blocks file reads from web content context, even with system principal. The file:// protocol handler has special permissions, but our custom MHTML loading code doesn't.

## Attempted Solutions

### Attempt 1: Direct File Reading ❌
```cpp
NS_NewLocalFileInputStream(file)  // Blocked by sandbox
```

### Attempt 2: Channel-based Reading ❌  
```cpp
NS_NewChannel() → channel->Open()  // Still blocked
```

### Attempt 3: System Principal ❌
```cpp
aLoadState->SetTriggeringPrincipal(GetSystemPrincipal())  // Still blocked
```

## Proper Solution: Stream Converter (In Progress)

**Architecture (matches Chrome):**
1. User opens `file:///path/to/file.mhtml`
2. File:// protocol handler reads file (✅ has permissions)
3. **Stream converter** processes the stream:
   - Input: Raw MHTML bytes from file:// handler
   - Process: Parse MHT ML, extract HTML, rewrite URLs
   - Output: HTML stream to browser
4. Browser displays HTML

**Status:**
- ✅ Stream converter implemented (`MHTMLConverter.sys.mjs`)
- ✅ XPCOM registration (`components.conf`)
- ❌ **TODO:** Proper wiring in `nsDocShell` to invoke converter
- ❌ **TODO:** Test and debug stream converter

**Complexity:**  
This requires creating proper listener chains in C++ to pipe the file:// handler's output through the stream converter, then to the document viewer. This is non-trivial plumbing.

## Workaround

**For Testing/Demo:**
```bash
# This works because CLI gets automatic permission
./mach run "/path/to/file.mhtml"
```

## Recommendation

### Option A: Ship Export Only (Recommended for v1)
- ✅ MHTML **export** is production-ready NOW
- ✅ Users can save pages and open in Chrome
- ⏸️ Defer **import** to v2 with proper stream converter
- 📝 Document CLI workaround for power users

### Option B: Complete Stream Converter (More Work)
- 🔧 Finish C++ plumbing for stream converter
- 🧪 Extensive testing with various MHTML files  
- ⏱️ Estimated: 2-3 additional days of work

### Option C: Platform-Specific Permissions
- 🍎 Request Full Disk Access on macOS
- 📱 Show permission prompt for restricted directories
- ⚠️ Complex UX, may confuse users

## Current Code State

**Disabled in `nsDocShell.cpp`:**
```cpp
// MHTML support temporarily disabled due to macOS sandbox restrictions
// TODO: Implement proper stream converter approach
// For now, MHTML files can be loaded via CLI
```

**Stream Converter Ready:**
- `MHTMLConverter.sys.mjs` - fully implemented
- Needs C++ wiring to actually be invoked

## Testing

### Export (Works ✅)
```bash
./mach test toolkit/components/windowcreator/test/browser_persist_mhtml.js
# Result: 48/48 PASS
```

### Import (Blocked ⚠️)
```bash
# Via URL bar: BLOCKED by sandbox
# Via CLI: WORKS
./mach run "/tmp/test.mhtml"
```

## Next Steps

1. **Decision**: Ship export-only (Option A) or complete import (Option B)?

2. **If Option A (Recommended)**:
   - Remove debug logging
   - Update documentation to focus on export
   - Note CLI workaround for import
   - Ship it! 🚀

3. **If Option B**:
   - Complete stream converter wiring in C++
   - Create listener wrapper for converter
   - Test with various MHTML sources
   - Debug edge cases

## Files

- `MHTMLConverter.sys.mjs` - Stream converter (complete)
- `components.conf` - XPCOM registration (complete)
- `nsDocShell.cpp::LoadMHTMLFile` - Needs proper converter invocation
- Tests - Export tests passing, import tests skipped

## Related Docs

- [STREAM_CONVERTER_ARCHITECTURE.md](./STREAM_CONVERTER_ARCHITECTURE.md)
- [FILE_ACCESS_FIX.md](./FILE_ACCESS_FIX.md)
- [STATUS.md](./STATUS.md)

