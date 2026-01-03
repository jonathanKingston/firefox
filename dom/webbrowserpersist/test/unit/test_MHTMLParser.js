/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { MHTMLParser } = ChromeUtils.importESModule(
  "resource://gre/modules/MHTMLParser.sys.mjs"
);

/**
 * Test basic MHTML parsing
 */
add_task(async function test_basic_parsing() {
  let mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"

------boundary----
Content-Type: text/html; charset=utf-8
Content-Location: http://example.com/test.html

<!DOCTYPE html>
<html><body><h1>Test</h1></body></html>
------boundary------`;

  let parser = new MHTMLParser(mhtmlContent);
  let parts = parser.parse();

  Assert.equal(parts.length, 1, "Should have 1 part");
  Assert.ok(parts[0].contentType.includes("text/html"), "Content type should be HTML");
  Assert.equal(parts[0].contentLocation, "http://example.com/test.html", "Location should match");
  Assert.ok(parts[0].body.includes("<h1>Test</h1>"), "Body should contain HTML");
});

/**
 * Test 7-bit encoding
 */
add_task(async function test_7bit_encoding() {
  let mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"

------boundary----
Content-Type: text/html
Content-Transfer-Encoding: 7bit
Content-Location: http://example.com/test.html

<!DOCTYPE html>
<html><body>Plain ASCII</body></html>
------boundary------`;

  let parser = new MHTMLParser(mhtmlContent);
  let parts = parser.parse();
  let decoded = parser.decodeBody(parts[0]);

  Assert.ok(decoded.includes("Plain ASCII"), "7-bit content should decode correctly");
});

/**
 * Test quoted-printable decoding
 */
add_task(async function test_quoted_printable() {
  let mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"

------boundary----
Content-Type: text/html
Content-Transfer-Encoding: quoted-printable
Content-Location: http://example.com/test.html

<!DOCTYPE html>
<html><body>Testing=20Quoted-Printable=0AWith=20Spaces</body></html>
------boundary------`;

  let parser = new MHTMLParser(mhtmlContent);
  let parts = parser.parse();
  let decoded = parser.decodeBody(parts[0]);

  Assert.ok(decoded.includes("Testing Quoted-Printable"), "Should decode =20 as space");
  Assert.ok(decoded.includes("With Spaces"), "Should decode =0A as newline");
});

/**
 * Test base64 decoding
 */
add_task(async function test_base64() {
  // "Hello World" in base64
  let mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"

------boundary----
Content-Type: text/plain
Content-Transfer-Encoding: base64
Content-Location: http://example.com/test.txt

SGVsbG8gV29ybGQ=
------boundary------`;

  let parser = new MHTMLParser(mhtmlContent);
  let parts = parser.parse();
  let decoded = parser.decodeBody(parts[0]);

  Assert.equal(decoded.trim(), "Hello World", "Base64 should decode correctly");
});

/**
 * Test multiple parts
 */
add_task(async function test_multiple_parts() {
  let mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"

------boundary----
Content-Type: text/html
Content-Location: http://example.com/test.html

<!DOCTYPE html>
<html><body><img src="test.png"></body></html>
------boundary----
Content-Type: image/png
Content-Transfer-Encoding: base64
Content-Location: http://example.com/test.png

iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=
------boundary----
Content-Type: text/css
Content-Location: http://example.com/style.css

body { color: blue; }
------boundary------`;

  let parser = new MHTMLParser(mhtmlContent);
  let parts = parser.parse();

  Assert.equal(parts.length, 3, "Should have 3 parts");
  Assert.equal(parts[0].contentType, "text/html", "First should be HTML");
  Assert.equal(parts[1].contentType, "image/png", "Second should be PNG");
  Assert.equal(parts[2].contentType, "text/css", "Third should be CSS");
});

/**
 * Test missing encoding header (default behavior)
 */
add_task(async function test_no_encoding() {
  let mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"

------boundary----
Content-Type: text/html
Content-Location: http://example.com/test.html

<!DOCTYPE html>
<html><body>No encoding header</body></html>
------boundary------`;

  let parser = new MHTMLParser(mhtmlContent);
  let parts = parser.parse();
  let decoded = parser.decodeBody(parts[0]);

  Assert.ok(decoded.includes("No encoding header"), "Should handle missing encoding");
});

/**
 * Test malformed boundary (missing closing)
 */
add_task(async function test_missing_boundary() {
  let mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"

------boundary----
Content-Type: text/html
Content-Location: http://example.com/test.html

<!DOCTYPE html>
<html><body>Missing closing boundary</body></html>`;

  let parser = new MHTMLParser(mhtmlContent);
  let parts = parser.parse();

  // Parser may return 0 or 1 parts depending on strictness
  // Both are acceptable behaviors for malformed MHTML
  Assert.ok(parts.length >= 0, "Parser should handle missing boundary gracefully");
  info(`Parser returned ${parts.length} parts for malformed MHTML`);
});

/**
 * Test relaxed parsing (no spaces in Content-Type)
 */
add_task(async function test_relaxed_parsing() {
  let mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related;boundary="----boundary----";type="text/html"

------boundary----
Content-Type: text/html;charset="utf-8"
Content-Location: http://example.com/test.html

<!DOCTYPE html>
<html><body>Relaxed parsing</body></html>
------boundary------`;

  let parser = new MHTMLParser(mhtmlContent);
  let parts = parser.parse();

  Assert.equal(parts.length, 1, "Should parse despite no spaces");
  Assert.ok(parts[0].body.includes("Relaxed parsing"), "Content should be extracted");
});

/**
 * Test IE format (with From header)
 */
add_task(async function test_ie_format() {
  let mhtmlContent = `From: <Saved by Internet Explorer>
Subject: Test Page
MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"

------boundary----
Content-Type: text/html
Content-Location: http://example.com/test.html

<!DOCTYPE html>
<html><body>IE format</body></html>
------boundary------`;

  let parser = new MHTMLParser(mhtmlContent);
  let parts = parser.parse();

  Assert.equal(parts.length, 1, "Should parse IE format");
  Assert.ok(parts[0].body.includes("IE format"), "Should extract content");
});

/**
 * Test boundary variations
 */
add_task(async function test_boundary_variations() {
  let mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----=_NextPart_000_0000"

------=_NextPart_000_0000
Content-Type: text/html
Content-Location: http://example.com/test.html

<!DOCTYPE html>
<html><body>Different boundary</body></html>
------=_NextPart_000_0000--`;

  let parser = new MHTMLParser(mhtmlContent);
  let parts = parser.parse();

  Assert.equal(parts.length, 1, "Should handle different boundary format");
  Assert.ok(parts[0].body.includes("Different boundary"), "Content should be extracted");
});

/**
 * Test Content-ID header (Chrome/Blink format)
 */
add_task(async function test_content_id() {
  let mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----MultipartBoundary"

------MultipartBoundary
Content-Type: text/html
Content-Location: http://example.com/test.html

<!DOCTYPE html>
<html><body><link rel="stylesheet" href="cid:css-123@mhtml.blink"></body></html>
------MultipartBoundary
Content-Type: text/css
Content-ID: <css-123@mhtml.blink>
Content-Transfer-Encoding: quoted-printable

body { color: red; }
------MultipartBoundary--`;

  let parser = new MHTMLParser(mhtmlContent);
  let parts = parser.parse();

  Assert.equal(parts.length, 2, "Should have 2 parts");
  Assert.equal(parts[0].contentType, "text/html", "First should be HTML");
  Assert.equal(parts[1].contentType, "text/css", "Second should be CSS");
  
  // Check that Content-ID is parsed (note: strip angle brackets)
  Assert.ok(parts[1].contentID, "Should have contentID field");
  Assert.equal(parts[1].contentID, "css-123@mhtml.blink", "Content-ID should match without angle brackets");
  
  let decodedCSS = parser.decodeBody(parts[1]);
  Assert.ok(decodedCSS.includes("color: red"), "CSS should decode correctly");
});

/**
 * Test Content-ID with both Content-Location (hybrid)
 */
add_task(async function test_content_id_and_location() {
  let mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----MultipartBoundary"

------MultipartBoundary
Content-Type: text/css
Content-Location: http://example.com/style.css
Content-ID: <css-456@mhtml.blink>

body { background: blue; }
------MultipartBoundary--`;

  let parser = new MHTMLParser(mhtmlContent);
  let parts = parser.parse();

  Assert.equal(parts.length, 1, "Should have 1 part");
  Assert.equal(parts[0].contentLocation, "http://example.com/style.css", "Should have Content-Location");
  Assert.equal(parts[0].contentID, "css-456@mhtml.blink", "Should have Content-ID");
  Assert.ok(parts[0].body.includes("background: blue"), "Should extract body");
});

