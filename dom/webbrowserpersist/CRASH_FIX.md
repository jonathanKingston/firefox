# MHTML CID Support Crash Fix

## Issue

After implementing Content-ID (CID) support for MHTML files, a crash was reported:
```
EXC_BAD_ACCESS (SIGSEGV)
KERN_INVALID_ADDRESS at 0x0000000000000000
nsHtml5StreamParser::DoDataAvailableBuffer
```

This crash occurred when loading Chrome-generated MHTML files that use `cid:` references.

## Root Cause Analysis

The crash was caused by several issues in `nsDocShell::LoadMHTMLFile`:

1. **Incorrect Principal**: Using `GetSystemPrincipal()` instead of creating a proper content principal for the file:// URI
2. **Missing Validation**: No checks for empty or corrupted HTML content before creating the input stream
3. **Stream Ownership**: Potential issues with stream ownership transfer via `forget()`
4. **Size Limits**: No protection against extremely large HTML content after data: URL rewriting

## Fixes Applied

### 1. Defensive Validation Checks

Added comprehensive validation before creating the input stream:

```cpp
// Defensive check: ensure htmlContent is not empty and is valid
if (htmlContent.IsEmpty()) {
  return NS_ERROR_FAILURE;
}

// Defensive check: ensure htmlContent doesn't exceed a reasonable size (100MB)
const uint32_t MAX_HTML_SIZE = 100 * 1024 * 1024;
if (htmlContent.Length() > MAX_HTML_SIZE) {
  return NS_ERROR_FILE_TOO_BIG;
}

// Defensive check: ensure htmlContent doesn't contain null bytes
if (htmlContent.FindChar('\0') != kNotFound) {
  return NS_ERROR_FAILURE;
}
```

### 2. Proper Principal Creation

Changed from `GetSystemPrincipal()` to `BasePrincipal::CreateContentPrincipal()`:

```cpp
// Get the principal for the file:// URI
nsCOMPtr<nsIPrincipal> principal = BasePrincipal::CreateContentPrincipal(aURI, OriginAttributes());
if (!principal) {
  return NS_ERROR_FAILURE;
}
```

This creates a proper content principal for the file:// URI, providing:
- Unique origin per file
- Partitioned storage
- No cross-origin network access
- Proper security boundaries

### 3. Stream Ownership

Used `std::move()` to explicitly transfer ownership of the HTML content:

```cpp
rv = NS_NewCStringInputStream(getter_AddRefs(htmlStream), std::move(htmlContent));
if (NS_FAILED(rv) || !htmlStream) {
  return NS_ERROR_FAILURE;
}
```

### 4. Channel Validation

Added explicit check for channel creation:

```cpp
if (NS_FAILED(rv) || !channel) {
  return NS_ERROR_FAILURE;
}
```

## Testing

Tested with the problematic Chrome-generated MHTML file:
```
file:///Users/jonathankingston/Downloads/www_usmagazine_com-2025-12-30T22-22-53-288Z.mhtml
```

**Result**: ✅ No crash, browser loads successfully

## Files Modified

- `docshell/base/nsDocShell.cpp`:
  - Added validation checks for HTML content
  - Fixed principal creation
  - Improved stream ownership handling
  - Added size limits

## Impact

These fixes improve the robustness of MHTML loading:
- Prevents crashes from malformed or corrupted MHTML files
- Provides proper security isolation via correct principal
- Adds protection against extremely large files
- Improves error handling and debugging

## Future Considerations

1. Consider adding telemetry for MHTML load failures
2. Add more comprehensive error messages for debugging
3. Consider progressive loading for very large MHTML files
4. Add memory pressure monitoring during URL rewriting

## Related Documentation

- [CID_SUPPORT.md](./CID_SUPPORT.md) - CID implementation details
- [RESOURCE_INTERCEPTION_IMPLEMENTATION.md](./RESOURCE_INTERCEPTION_IMPLEMENTATION.md) - URL rewriting logic
- [STATUS.md](./STATUS.md) - Overall MHTML implementation status

