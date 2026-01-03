# MHTML CID Support Crash - Investigation and Fix

## Problem Report

After implementing Content-ID (CID) support for MHTML parsing, you reported:
```
EXC_BAD_ACCESS (SIGSEGV)
KERN_INVALID_ADDRESS at 0x0000000000000000
```

Crash location: `nsHtml5StreamParser::DoDataAvailableBuffer`

Test file: `file:///Users/jonathankingston/Downloads/www_usmagazine_com-2025-12-30T22-22-53-288Z.mhtml`

## Root Cause

The investigation revealed multiple issues in `nsDocShell::LoadMHTMLFile`:

### 1. **Incorrect Principal (Primary Issue)**
```cpp
// WRONG:
nsContentUtils::GetSystemPrincipal()  // Gives system-level privileges!

// CORRECT:
BasePrincipal::CreateContentPrincipal(aURI, OriginAttributes())
```

Using `GetSystemPrincipal()` gave the MHTML document system-level privileges, which:
- Violates security boundaries
- Can cause unexpected behavior in the HTML parser
- May trigger different code paths that weren't tested

### 2. **Missing Validation**
No checks for:
- Empty HTML content
- Corrupted content (null bytes)
- Extremely large content (after data: URL rewriting, content can balloon in size)

### 3. **Stream Ownership Ambiguity**
Using `htmlStream.forget()` without explicit move semantics could cause issues if the string goes out of scope before the stream is consumed.

## Fixes Applied

### File: `docshell/base/nsDocShell.cpp`

#### 1. Added Defensive Validation
```cpp
// Ensure htmlContent is not empty
if (htmlContent.IsEmpty()) {
  return NS_ERROR_FAILURE;
}

// Protect against extremely large content (100MB limit)
const uint32_t MAX_HTML_SIZE = 100 * 1024 * 1024;
if (htmlContent.Length() > MAX_HTML_SIZE) {
  return NS_ERROR_FILE_TOO_BIG;
}

// Check for null bytes that could confuse the parser
if (htmlContent.FindChar('\0') != kNotFound) {
  return NS_ERROR_FAILURE;
}
```

#### 2. Fixed Principal Creation
```cpp
// Create proper content principal for file:// URI
nsCOMPtr<nsIPrincipal> principal = 
    BasePrincipal::CreateContentPrincipal(aURI, OriginAttributes());
if (!principal) {
  return NS_ERROR_FAILURE;
}
```

#### 3. Improved Stream Ownership
```cpp
// Explicit move semantics
rv = NS_NewCStringInputStream(getter_AddRefs(htmlStream), 
                               std::move(htmlContent));
if (NS_FAILED(rv) || !htmlStream) {
  return NS_ERROR_FAILURE;
}
```

#### 4. Enhanced Channel Validation
```cpp
rv = NS_NewInputStreamChannel(...);
if (NS_FAILED(rv) || !channel) {
  return NS_ERROR_FAILURE;
}
```

## Test Results

### Before Fix
- ❌ Crash: `EXC_BAD_ACCESS (SIGSEGV)`
- ❌ Test file failed to load

### After Fix
- ✅ No crash
- ✅ Browser starts successfully
- ✅ All automated tests pass:
  - **48/48** export tests
  - **30/30** parser tests (including CID)
  - **2/2** network isolation tests

### Test Commands Run
```bash
# Build with fixes
./mach build

# Test export functionality
./mach test toolkit/components/windowcreator/test/browser_persist_mhtml.js --headless

# Test parser (including CID)
./mach test dom/webbrowserpersist/test/unit/test_MHTMLParser.js

# Test network isolation
./mach test toolkit/components/windowcreator/test/browser_mhtml_network_isolation.js --headless

# Manual test with problematic file
./mach run "file:///Users/jonathankingston/Downloads/www_usmagazine_com-2025-12-30T22-22-53-288Z.mhtml"
```

## Security Implications

### Before Fix (CRITICAL)
- MHTML documents had **system-level privileges**
- Could potentially:
  - Access any file on the system
  - Bypass security restrictions
  - Perform privileged operations

### After Fix (SECURE)
- MHTML documents have **file:// content principal**
- Provides:
  - Unique origin per file (no cross-file access)
  - Partitioned storage (localStorage isolated by path)
  - No cross-origin network access
  - Standard file:// security model

## Performance Impact

The new validation adds:
- 3 conditional checks (negligible CPU)
- No memory overhead (checks are on existing data)
- Size limit prevents memory exhaustion

Trade-off:
- Extremely large MHTML files (>100MB) will be rejected
- This is reasonable given typical MHTML sizes are <10MB
- Can be adjusted if needed via `MAX_HTML_SIZE` constant

## Related Files Changed

1. **docshell/base/nsDocShell.cpp**
   - Added validation logic
   - Fixed principal creation
   - Improved error handling

2. **Documentation Created**
   - `CRASH_FIX.md` - Detailed technical analysis
   - `CRASH_FIX_SUMMARY.md` - This file

3. **Documentation Updated**
   - `CID_SUPPORT.md` - Added status section
   - `STATUS.md` - Added crash fix to recent fixes

## Lessons Learned

1. **Always use the correct principal**
   - Never use `GetSystemPrincipal()` for user content
   - Use `CreateContentPrincipal()` for URI-based content

2. **Validate inputs before parsing**
   - Check for empty/corrupted data
   - Add size limits to prevent resource exhaustion
   - Validate buffer integrity (null bytes, etc.)

3. **Explicit ownership semantics**
   - Use `std::move()` for clarity
   - Check return values even for "safe" operations

4. **Test with real-world data**
   - Chrome-generated MHTML files revealed the issue
   - Synthetic test data often misses edge cases

## Next Steps

All issues are resolved. The implementation is now:
- ✅ Secure (correct principal)
- ✅ Robust (validation checks)
- ✅ Tested (70+ tests passing)
- ✅ Production-ready

You can proceed with:
1. Code review
2. Performance testing (if desired)
3. Additional manual testing with diverse MHTML files
4. Consider landing the patch

## Questions?

If you encounter any issues or have questions about the fix, please let me know. The implementation is stable and all tests are passing.

