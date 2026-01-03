# Stream Converter Investigation Findings

## What We Tried

### Attempt 1: Set Content-Type After Channel Creation
```cpp
channel->SetContentType("multipart/related"_ns);
```
**Result:** Tab crashes (signal 11) before converter runs

### Attempt 2: TypeHint Only
```cpp
aLoadState->SetTypeHint("multipart/related"_ns);
```
**Result:** File picker dialog, converter never triggered

## Root Cause

Stream converters in Firefox are triggered based on the **channel's Content-Type when it's created**, not after. The sequence is:

```
1. Channel created with Content-Type from file extension
2. Stream converter service checks if converter exists for that type
3. If yes, converter is attached to the channel
4. Channel opens, data flows through converter
```

Our problem: `.mhtml` files don't have a registered MIME type in Firefox, so file:// channels get `application/octet-stream` or similar, and no converter is attached.

## Why Setting Content-Type Crashes

Setting Content-Type **after** channel creation but **before** opening causes issues because:
- The channel's internal state expects the Content-Type to be immutable after certain initialization
- Stream converter attachment happens during channel setup, not during open
- Changing Content-Type mid-flight confuses the channel state machine

## Proper Solutions

### Option A: Register MIME Type (Cleanest)
Register `.mhtml` → `multipart/related` in Firefox's MIME type database so file:// channels are created with the correct type from the start.

**Files to modify:**
- `uriloader/exthandler/nsExternalHelperAppService.cpp` - Add MIME type mapping
- Or use `nsIMIMEService` to register at runtime

### Option B: Content Sniffer (Chrome's Approach)
Implement `nsIContentSniffer` that detects MHTML by reading the first few bytes and returns `multipart/related`.

**Advantages:**
- Works without file extension
- Handles MHTML files named `.html` or `.htm`
- Matches Chrome's behavior

**Implementation:**
```javascript
export class MHTMLContentSniffer {
  getMIMETypeFromContent(aRequest, aData, aLength) {
    // Check for MHTML boundary marker
    const header = new TextDecoder().decode(aData.slice(0, Math.min(512, aLength)));
    if (header.includes('boundary=') && header.includes('multipart/related')) {
      return 'multipart/related';
    }
    return '';
  }
}
```

### Option C: Custom Protocol Handler (Our Original Approach)
Keep the `LoadMHTMLFile` intercept but solve the permission issue.

**Problem:** Requires solving macOS sandbox restrictions for early file access.

## Recommendation

**Option B (Content Sniffer)** is the best approach because:
1. ✅ No crashes - MIME type set correctly from the start
2. ✅ Works for URL bar, CLI, session restore, file picker
3. ✅ Handles files without `.mhtml` extension
4. ✅ Matches Chrome's architecture
5. ✅ No sandbox issues - file opened by normal file:// handler

## Next Steps

1. Implement `MHTMLContentSniffer.sys.mjs`
2. Register it in `components.conf` for `nsIContentSniffer`
3. Remove the `DoURILoad` intercept
4. Test with various MHTML files

## Current State

- ✅ **MHTML Export**: Fully working
- ⚠️ **MHTML Import**: Stream converter registered but not triggered
- ❌ **File:// Loading**: Shows file picker or downloads file

**Workaround:** Use CLI with the old `LoadMHTMLFile` approach (works for session restore/CLI, fails for URL bar due to sandbox).

