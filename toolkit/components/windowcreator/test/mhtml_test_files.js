/**
 * MHTML test files based on Chrome's test suite
 * These test various MHTML formats and edge cases
 */

"use strict";

/**
 * Test file definitions inspired by Chrome's MHTML test suite
 */
const MHTMLTestFiles = {
  // Basic 7-bit encoding
  transfer_encoding_7bit: {
    name: "transfer_encoding_7bit.mht",
    content: `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"; type="text/html"

------boundary----
Content-Type: text/html; charset="utf-8"
Content-Transfer-Encoding: 7bit
Content-Location: http://example.com/test.html

<!DOCTYPE html>
<html>
<head><title>7-bit Encoding Test</title></head>
<body>
<h1>7-bit Transfer Encoding</h1>
<p>This is plain ASCII text.</p>
</body>
</html>
------boundary------`,
    expected: {
      title: "7-bit Encoding Test",
      contentIncludes: "7-bit Transfer Encoding",
    },
  },

  // 8-bit encoding
  transfer_encoding_8bit: {
    name: "transfer_encoding_8bit.mht",
    content: `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"; type="text/html"

------boundary----
Content-Type: text/html; charset="utf-8"
Content-Transfer-Encoding: 8bit
Content-Location: http://example.com/test.html

<!DOCTYPE html>
<html>
<head><title>8-bit Encoding Test</title></head>
<body>
<h1>8-bit Transfer Encoding</h1>
<p>Content with special chars: © ® ™</p>
</body>
</html>
------boundary------`,
    expected: {
      title: "8-bit Encoding Test",
      contentIncludes: "8-bit Transfer Encoding",
    },
  },

  // Missing Content-Transfer-Encoding header
  content_transfer_encoding_none: {
    name: "content_transfer_encoding_none.mht",
    content: `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"; type="text/html"

------boundary----
Content-Type: text/html; charset="utf-8"
Content-Location: http://example.com/test.html

<!DOCTYPE html>
<html>
<head><title>No Encoding Header</title></head>
<body>
<h1>Missing Content-Transfer-Encoding</h1>
<p>Should default to 7bit or raw content.</p>
</body>
</html>
------boundary------`,
    expected: {
      title: "No Encoding Header",
      contentIncludes: "Missing Content-Transfer-Encoding",
    },
  },

  // Invalid boundary - missing closing boundary
  invalid_bad_boundary_missing: {
    name: "invalid_bad_boundary_missing.mht",
    content: `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"; type="text/html"

------boundary----
Content-Type: text/html; charset="utf-8"
Content-Location: http://example.com/test.html

<!DOCTYPE html>
<html>
<head><title>Bad Boundary</title></head>
<body>
<h1>Missing Closing Boundary</h1>
<p>This MHTML file has no closing boundary.</p>
</body>
</html>`,
    expected: {
      shouldFail: false, // Should handle gracefully
      contentIncludes: "Missing Closing Boundary",
    },
  },

  // Invalid boundary - wrong boundary string
  invalid_bad_boundary_mismatch: {
    name: "invalid_bad_boundary_mismatch.mht",
    content: `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"; type="text/html"

------wrongboundary----
Content-Type: text/html; charset="utf-8"
Content-Location: http://example.com/test.html

<!DOCTYPE html>
<html>
<head><title>Wrong Boundary</title></head>
<body>
<h1>Mismatched Boundary</h1>
</body>
</html>
------wrongboundary------`,
    expected: {
      shouldFail: true, // Should fail to parse
    },
  },

  // Relative URLs in resources
  relative_url: {
    name: "relative_url.mht",
    content: `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"; type="text/html"

------boundary----
Content-Type: text/html; charset="utf-8"
Content-Location: http://example.com/page.html

<!DOCTYPE html>
<html>
<head>
<title>Relative URL Test</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<h1>Testing Relative URLs</h1>
<img src="images/test.png" alt="Test">
<a href="other.html">Link</a>
</body>
</html>
------boundary----
Content-Type: text/css
Content-Location: http://example.com/style.css

body { color: blue; }
------boundary----
Content-Type: image/png
Content-Transfer-Encoding: base64
Content-Location: http://example.com/images/test.png

iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=
------boundary------`,
    expected: {
      title: "Relative URL Test",
      contentIncludes: "Testing Relative URLs",
      hasResources: true,
    },
  },

  // JavaScript content (should be stripped in export)
  page_with_javascript: {
    name: "page_with_javascript.mht",
    content: `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"; type="text/html"

------boundary----
Content-Type: text/html; charset="utf-8"
Content-Location: http://example.com/js-test.html

<!DOCTYPE html>
<html>
<head>
<title>JavaScript Test</title>
</head>
<body>
<h1>Page with JavaScript</h1>
<p>Visible content</p>
</body>
</html>
------boundary------`,
    expected: {
      title: "JavaScript Test",
      contentIncludes: "Visible content",
      scriptsShouldBeStripped: true,
    },
  },

  // Multi-frame/iframe content
  multi_frames: {
    name: "multi_frames.mht",
    content: `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"; type="text/html"

------boundary----
Content-Type: text/html; charset="utf-8"
Content-Location: http://example.com/frames.html

<!DOCTYPE html>
<html>
<head><title>Multi Frame Test</title></head>
<body>
<h1>Main Frame</h1>
<iframe src="frame1.html"></iframe>
<iframe src="frame2.html"></iframe>
</body>
</html>
------boundary----
Content-Type: text/html; charset="utf-8"
Content-Location: http://example.com/frame1.html

<!DOCTYPE html>
<html>
<body><h2>Frame 1</h2></body>
</html>
------boundary----
Content-Type: text/html; charset="utf-8"
Content-Location: http://example.com/frame2.html

<!DOCTYPE html>
<html>
<body><h2>Frame 2</h2></body>
</html>
------boundary------`,
    expected: {
      title: "Multi Frame Test",
      contentIncludes: "Main Frame",
      hasFrames: true,
    },
  },

  // Relaxed content-type parameters (Opera compatibility)
  relaxed_content_type_parameters: {
    name: "relaxed-content-type-parameters.mht",
    content: `MIME-Version: 1.0
Content-Type: multipart/related;boundary="----boundary----";type="text/html"

------boundary----
Content-Type: text/html;charset="utf-8"
Content-Location: http://example.com/test.html

<!DOCTYPE html>
<html>
<head><title>Relaxed Parsing</title></head>
<body>
<h1>Content-Type without spaces</h1>
<p>Tests lenient MIME header parsing.</p>
</body>
</html>
------boundary------`,
    expected: {
      title: "Relaxed Parsing",
      contentIncludes: "lenient MIME header parsing",
    },
  },

  // Resource not in archive
  resource_not_in_archive: {
    name: "resource_not_in_archive.mht",
    content: `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"; type="text/html"

------boundary----
Content-Type: text/html; charset="utf-8"
Content-Location: http://example.com/test.html

<!DOCTYPE html>
<html>
<head>
<title>Missing Resource Test</title>
<link rel="stylesheet" href="missing.css">
</head>
<body>
<h1>Page with Missing Resources</h1>
<img src="missing-image.png" alt="This image is not in the archive">
</body>
</html>
------boundary------`,
    expected: {
      title: "Missing Resource Test",
      contentIncludes: "Page with Missing Resources",
      hasMissingResources: true,
    },
  },

  // IE format compatibility
  ie_format: {
    name: "test_ie.mht",
    content: `From: <Saved by Internet Explorer>
Subject: Test Page
Date: Fri, 2 Jan 2026 10:00:00 -0000
MIME-Version: 1.0
Content-Type: multipart/related; type="text/html"; boundary="----=_NextPart_000_0000_01D9999A.12345678"

This is a multi-part message in MIME format.

------=_NextPart_000_0000_01D9999A.12345678
Content-Type: text/html; charset="utf-8"
Content-Transfer-Encoding: quoted-printable
Content-Location: http://example.com/ie-test.html

<!DOCTYPE html>=0D=0A<html>=0D=0A<head><title>IE Format Test</title></head>=
=0D=0A<body>=0D=0A<h1>Internet Explorer MHTML Format</h1>=0D=0A<p>Testing =
IE-specific MHTML quirks.</p>=0D=0A</body>=0D=0A</html>
------=_NextPart_000_0000_01D9999A.12345678--`,
    expected: {
      title: "IE Format Test",
      contentIncludes: "Internet Explorer MHTML Format",
      isIEFormat: true,
    },
  },

  // UnMHT extension format
  unmht_format: {
    name: "test_unmht.mht",
    content: `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----MultipartBoundary--"; type="text/html"

------MultipartBoundary--
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: quoted-printable
Content-Location: http://example.com/unmht-test.html

<!DOCTYPE html>=0D=0A<html>=0D=0A<head><title>UnMHT Format Test</title></h=
ead>=0D=0A<body>=0D=0A<h1>UnMHT Extension Format</h1>=0D=0A<p>Testing UnMH=
T Firefox extension format.</p>=0D=0A</body>=0D=0A</html>
------MultipartBoundary----`,
    expected: {
      title: "UnMHT Format Test",
      contentIncludes: "UnMHT Extension Format",
    },
  },
};

// Export for use in tests
if (typeof module !== "undefined") {
  module.exports = { MHTMLTestFiles };
}

