# MHTML Content-Transfer-Encoding Reference

## Overview

MHTML uses standard MIME `Content-Transfer-Encoding` headers to specify how the body content is encoded.

## Encoding Types:

### 1. `7bit` (Default)
**What it means**: Content uses only ASCII characters (0-127)

**Encoding**: None - content is raw

**Example**:
```
Content-Transfer-Encoding: 7bit

<!DOCTYPE html>
<html><body>Plain ASCII text</body></html>
```

**Test**: ✅ `transfer_encoding_7bit` in test files

---

### 2. `8bit`
**What it means**: Content can use full byte range (0-255)

**Encoding**: None - content is raw with 8-bit characters

**Example**:
```
Content-Transfer-Encoding: 8bit

<!DOCTYPE html>
<html><body>Special chars: © ® ™</body></html>
```

**Test**: ✅ `transfer_encoding_8bit` in test files

---

### 3. `quoted-printable`
**What it means**: Content is encoded using `=XX` notation

**Encoding rules**:
- Non-printable characters → `=XX` (XX = hex value)
- `=20` → space (at end of line)
- `=0D=0A` → CRLF (Windows line ending)
- `=0A` → LF (Unix line ending)
- `=` at end of line → soft line break (line continuation)
- Lines max 76 characters (RFC requirement)

**Example**:
```
Content-Transfer-Encoding: quoted-printable

<!DOCTYPE html>=0D=0A<html>=0D=0A<body>Testing=20Quoted-Printable=0AWith=20=
Spaces</body>=0D=0A</html>
```

**Decodes to**:
```html
<!DOCTYPE html>
<html>
<body>Testing Quoted-Printable
With Spaces</body>
</html>
```

**Tests**: 
- ✅ `test_quoted_printable` (unit test) - uses actual encoding
- ✅ `ie_format` (browser test) - now fixed with actual encoding
- ✅ `unmht_format` (browser test) - now fixed with actual encoding

---

### 4. `base64`
**What it means**: Content is base64-encoded

**Encoding**: Standard base64 alphabet (A-Z, a-z, 0-9, +, /)

**Example**:
```
Content-Transfer-Encoding: base64

PCFET0NUWVBFIGh0bWw+PGh0bWw+PGJvZHk+VGVzdDwvYm9keT48L2h0bWw+
```

**Decodes to**:
```html
<!DOCTYPE html><html><body>Test</body></html>
```

**Tests**:
- ✅ `test_base64` (unit test) - "Hello World" encoded
- ✅ `relative_url` (browser test) - PNG image data

---

### 5. No header (implicit `7bit`)
**What it means**: Same as `7bit` - plain ASCII

**Example**:
```
Content-Type: text/html

<!DOCTYPE html>
<html><body>No encoding header</body></html>
```

**Test**: ✅ `content_transfer_encoding_none` in test files

---

## Common Mistakes:

### ❌ WRONG: Declaring encoding without actually encoding
```
Content-Transfer-Encoding: quoted-printable

<!DOCTYPE html>
<html><body>Testing Quoted-Printable</body></html>
```
This declares quoted-printable but the content is raw HTML!

### ✅ CORRECT: Match declaration with actual encoding
```
Content-Transfer-Encoding: quoted-printable

<!DOCTYPE html>=0D=0A<html>=0D=0A<body>Testing=20Quoted-Printable</body>=0D=
=0A</html>
```

---

## Firefox Implementation:

### Export (Writing MHTML):
**File**: `nsMHTMLPersist.cpp`

- HTML → `quoted-printable`
- Binary (images, fonts) → `base64`
- CSS → `quoted-printable` or `7bit`

### Import (Reading MHTML):
**File**: `MHTMLParser.sys.mjs`

Decoding functions:
```javascript
decodeQuotedPrintable(text) {
  // =XX → char(XX)
  // =0D=0A → CRLF
  // = at EOL → soft break (remove)
}

decodeBase64(text) {
  // Standard base64 decode
  return atob(text.trim());
}
```

---

## Test Coverage:

### Unit Tests (Correct ✅):
| Test | Encoding | Content |
|------|----------|---------|
| `test_basic_parsing` | None | Raw HTML |
| `test_7bit_encoding` | `7bit` | Plain ASCII |
| `test_quoted_printable` | `quoted-printable` | `=20`, `=0A` encoded |
| `test_base64` | `base64` | "Hello World" base64 |
| `test_no_encoding` | None | Raw HTML |

### Browser Test Fixtures (Now Fixed ✅):
| Test | Encoding | Status |
|------|----------|--------|
| `transfer_encoding_7bit` | `7bit` | ✅ Correct |
| `transfer_encoding_8bit` | `8bit` | ✅ Correct |
| `ie_format` | `quoted-printable` | ✅ Fixed (was raw, now encoded) |
| `unmht_format` | `quoted-printable` | ✅ Fixed (was raw, now encoded) |
| `relative_url` (PNG) | `base64` | ✅ Correct |

---

## Chrome Compatibility:

Chrome uses the same encoding types. Our implementation:
- ✅ Decodes all types correctly
- ✅ Exports using same encodings as Chrome
- ✅ Interoperable (Firefox ↔ Chrome)

---

## References:

- **RFC 2045**: MIME Part One (Content-Transfer-Encoding)
- **RFC 2047**: MIME Part Three (Quoted-Printable)
- **RFC 2557**: MHTML Specification
- **Chrome**: `third_party/blink/renderer/core/frame/frame_serializer.cc`

---

## Summary:

**Encoding Type** | **Purpose** | **Content State**
---|---|---
`7bit` | Plain ASCII | Raw
`8bit` | Extended ASCII | Raw
`quoted-printable` | Text with newlines/spaces | **Encoded with =XX**
`base64` | Binary data | **Encoded with base64**
None | Same as `7bit` | Raw

**Key Point**: When `quoted-printable` or `base64` is declared, the content **MUST** actually be encoded. This was a bug in our browser test fixtures that is now fixed.

