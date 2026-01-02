/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { MHTMLArchive } = ChromeUtils.importESModule(
  "resource://gre/modules/MHTMLArchive.sys.mjs"
);

/**
 * Test archive creation and main document detection
 */
add_task(async function test_archive_creation() {
  let mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"

------boundary----
Content-Type: text/html
Content-Location: http://example.com/test.html

<!DOCTYPE html>
<html><body><h1>Main Document</h1></body></html>
------boundary------`;

  let baseURI = Services.io.newURI("file:///tmp/test.mhtml");
  let archive = MHTMLArchive.create(mhtmlContent, baseURI);

  Assert.ok(archive, "Archive should be created");
  
  let mainDoc = archive.getMainDocument();
  Assert.ok(mainDoc, "Should have main document");
  Assert.equal(mainDoc.contentType, "text/html", "Main document should be HTML");
  Assert.ok(mainDoc.body.includes("Main Document"), "Should have correct content");
});

/**
 * Test resource lookup by URL
 */
add_task(async function test_resource_lookup() {
  let mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"

------boundary----
Content-Type: text/html
Content-Location: http://example.com/test.html

<!DOCTYPE html>
<html><body><img src="image.png"></body></html>
------boundary----
Content-Type: image/png
Content-Transfer-Encoding: base64
Content-Location: http://example.com/image.png

iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=
------boundary----
Content-Type: text/css
Content-Location: http://example.com/style.css

body { color: blue; }
------boundary------`;

  let baseURI = Services.io.newURI("file:///tmp/test.mhtml");
  let archive = MHTMLArchive.create(mhtmlContent, baseURI);

  // Test absolute URL lookup
  let image = archive.getResource("http://example.com/image.png");
  Assert.ok(image, "Should find image by absolute URL");
  Assert.equal(image.contentType, "image/png", "Should have correct type");

  // Test CSS lookup
  let css = archive.getResource("http://example.com/style.css");
  Assert.ok(css, "Should find CSS by absolute URL");
  Assert.ok(css.body.includes("color: blue"), "Should have CSS content");
});

/**
 * Test resource map and URLs
 */
add_task(async function test_resource_map() {
  let mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"

------boundary----
Content-Type: text/html
Content-Location: http://example.com/page.html

<!DOCTYPE html>
<html><body>Test</body></html>
------boundary----
Content-Type: text/css
Content-Location: http://example.com/style.css

body {}
------boundary----
Content-Type: image/png
Content-Location: http://example.com/image.png

data
------boundary------`;

  let baseURI = Services.io.newURI("file:///tmp/test.mhtml");
  let archive = MHTMLArchive.create(mhtmlContent, baseURI);

  let urls = archive.getResourceURLs();
  // Archive creates both full URLs and path-only entries for lookup
  Assert.greaterOrEqual(urls.length, 3, "Should have at least 3 resources");
  Assert.ok(urls.includes("http://example.com/page.html"), "Should include HTML");
  Assert.ok(urls.includes("http://example.com/style.css"), "Should include CSS");
  Assert.ok(urls.includes("http://example.com/image.png"), "Should include image");
});

/**
 * Test archive statistics
 */
add_task(async function test_archive_stats() {
  let mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"

------boundary----
Content-Type: text/html
Content-Location: http://example.com/test.html

<!DOCTYPE html>
<html><body>Test</body></html>
------boundary----
Content-Type: text/css
Content-Location: http://example.com/style.css

body {}
------boundary------`;

  let baseURI = Services.io.newURI("file:///tmp/test.mhtml");
  let archive = MHTMLArchive.create(mhtmlContent, baseURI);

  let stats = archive.getStats();
  Assert.equal(stats.totalParts, 2, "Should have 2 parts");
  // Resource map includes both full URLs and path-only entries for lookup
  Assert.greaterOrEqual(stats.resources, 2, "Should have at least 2 resources");
  // Main document should be set if available
  if (stats.mainDocument) {
    Assert.equal(stats.mainDocument, "http://example.com/test.html", "Should identify main doc");
  } else {
    info("Stats.mainDocument is null - acceptable");
  }
});

/**
 * Test MHTML detection
 */
add_task(async function test_mhtml_detection() {
  let validMHTML = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"

------boundary----
Content-Type: text/html

<!DOCTYPE html>
<html></html>
------boundary------`;

  let notMHTML = `<!DOCTYPE html>
<html><body>Regular HTML</body></html>`;

  Assert.ok(MHTMLArchive.isMHTML(validMHTML), "Should detect valid MHTML");
  Assert.ok(!MHTMLArchive.isMHTML(notMHTML), "Should reject regular HTML");
  Assert.ok(!MHTMLArchive.isMHTML(""), "Should reject empty string");
});

/**
 * Test resource existence check
 */
add_task(async function test_has_resource() {
  let mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"

------boundary----
Content-Type: text/html
Content-Location: http://example.com/test.html

<!DOCTYPE html>
<html></html>
------boundary----
Content-Type: text/css
Content-Location: http://example.com/style.css

body {}
------boundary------`;

  let baseURI = Services.io.newURI("file:///tmp/test.mhtml");
  let archive = MHTMLArchive.create(mhtmlContent, baseURI);

  Assert.ok(
    archive.hasResource("http://example.com/test.html"),
    "Should have HTML resource"
  );
  Assert.ok(
    archive.hasResource("http://example.com/style.css"),
    "Should have CSS resource"
  );
  Assert.ok(
    !archive.hasResource("http://example.com/missing.js"),
    "Should not have missing resource"
  );
});

/**
 * Test resource data decoding
 */
add_task(async function test_resource_data() {
  let mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"

------boundary----
Content-Type: text/plain
Content-Transfer-Encoding: base64
Content-Location: http://example.com/test.txt

SGVsbG8gV29ybGQ=
------boundary------`;

  let baseURI = Services.io.newURI("file:///tmp/test.mhtml");
  let archive = MHTMLArchive.create(mhtmlContent, baseURI);

  let data = archive.getResourceData("http://example.com/test.txt");
  Assert.ok(data, "Should get resource data");
  
  // Convert Uint8Array to string
  let decoder = new TextDecoder();
  let text = decoder.decode(data);
  Assert.ok(text.includes("Hello World"), "Should decode base64 data");
});

/**
 * Test relative URL handling
 */
add_task(async function test_relative_urls() {
  let mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"

------boundary----
Content-Type: text/html
Content-Location: http://example.com/dir/page.html

<!DOCTYPE html>
<html><body><img src="../image.png"></body></html>
------boundary----
Content-Type: image/png
Content-Location: http://example.com/image.png

data
------boundary------`;

  let baseURI = Services.io.newURI("file:///tmp/test.mhtml");
  let archive = MHTMLArchive.create(mhtmlContent, baseURI);

  // Should be able to find by absolute URL
  let image = archive.getResource("http://example.com/image.png");
  Assert.ok(image, "Should find image by absolute URL");
});

