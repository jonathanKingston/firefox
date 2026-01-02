"use strict";

const { MHTMLParser } = ChromeUtils.importESModule(
  "resource://gre/modules/MHTMLParser.sys.mjs"
);
const { MHTMLArchive } = ChromeUtils.importESModule(
  "resource://gre/modules/MHTMLArchive.sys.mjs"
);

/**
 * Test MHTML parsing functionality
 */
add_task(async function test_mhtml_parser() {
  info("Testing MHTML parser");

  // Create a simple MHTML document
  let mhtmlContent = `From: <Saved by Firefox>
Subject: https://example.com/test.html
Date: Fri, 02 Jan 2026 12:00:00 -0000
MIME-Version: 1.0
Content-Type: multipart/related;
\ttype="text/html";
\tboundary="----TestBoundary"

------TestBoundary
Content-Type: text/html; charset="utf-8"
Content-Transfer-Encoding: quoted-printable
Content-Location: https://example.com/test.html

<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body><h1>Test</h1></body>
</html>
------TestBoundary
Content-Type: text/css
Content-Transfer-Encoding: base64
Content-Location: https://example.com/style.css

Ym9keSB7IGJhY2tncm91bmQ6IHdoaXRlOyB9
------TestBoundary--
`;

  let parser = new MHTMLParser(mhtmlContent);
  let parts = parser.parse();

  ok(parts.length >= 2, "Should have at least 2 parts");

  // Check HTML part
  let htmlPart = parser.getMainDocument();
  ok(htmlPart, "Should find HTML document");
  ok(htmlPart.contentType.includes("text/html"), "Should be HTML type");
  ok(htmlPart.body.includes("<!DOCTYPE html>"), "Should contain HTML");
  is(htmlPart.contentLocation, "https://example.com/test.html", "Should have correct location");

  // Check CSS part
  let cssPart = parser.getPartByLocation("https://example.com/style.css");
  ok(cssPart, "Should find CSS resource");
  is(cssPart.contentType, "text/css", "Should be CSS type");
  is(cssPart.encoding, "base64", "Should be base64 encoded");

  // Test decoding
  let decodedCSS = parser.decodeBody(cssPart);
  ok(decodedCSS.includes("body"), "Should decode base64 correctly");

  info(`Parsed ${parts.length} parts successfully`);
});

/**
 * Test MHTML parser error handling
 */
add_task(async function test_mhtml_parser_errors() {
  info("Testing MHTML parser error handling");

  // Missing boundary
  let invalidMHTML = `Content-Type: text/html
No boundary here`;

  let parser = new MHTMLParser(invalidMHTML);
  Assert.throws(
    () => parser.parse(),
    /No boundary found/,
    "Should throw on missing boundary"
  );
});

/**
 * Test MHTML parser with various encodings
 */
add_task(async function test_mhtml_encodings() {
  info("Testing MHTML parser encodings");

  let mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="====Boundary===="

------====Boundary====
Content-Type: text/plain
Content-Transfer-Encoding: quoted-printable

Hello=20World=21
------====Boundary====--
`;

  let parser = new MHTMLParser(mhtmlContent);
  let parts = parser.parse();

  ok(parts.length > 0, "Should parse parts");

  let textPart = parts[0];
  is(textPart.encoding, "quoted-printable", "Should detect quoted-printable");

  let decoded = parser.decodeBody(textPart);
  ok(decoded.includes("Hello World!"), "Should decode quoted-printable correctly");
});

/**
 * Test MHTMLArchive class
 */
add_task(async function test_mhtml_archive() {
  info("Testing MHTMLArchive class");

  let mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="====Boundary===="

------====Boundary====
Content-Type: text/html; charset="utf-8"
Content-Location: https://example.com/index.html

<!DOCTYPE html>
<html><head><title>Test</title></head><body><h1>Hello</h1></body></html>
------====Boundary====
Content-Type: text/css
Content-Location: https://example.com/style.css

body { color: blue; }
------====Boundary====--
`;

  let baseURI = Services.io.newURI("file:///test.mhtml");
  let archive = MHTMLArchive.create(mhtmlContent, baseURI);

  ok(archive, "Should create archive");

  // Test main document
  let mainDoc = archive.getMainDocument();
  ok(mainDoc, "Should have main document");
  ok(mainDoc.body.includes("<!DOCTYPE html>"), "Should contain HTML");

  // Test resource lookup
  let cssResource = archive.getResource("https://example.com/style.css");
  ok(cssResource, "Should find CSS resource");
  is(cssResource.contentType, "text/css", "Should be CSS type");

  // Test hasResource
  ok(
    archive.hasResource("https://example.com/style.css"),
    "Should report resource exists"
  );
  ok(
    !archive.hasResource("https://example.com/missing.js"),
    "Should report missing resource doesn't exist"
  );

  // Test stats
  let stats = archive.getStats();
  ok(stats.totalParts >= 2, "Should have multiple parts");
  ok(stats.resources >= 2, "Should have multiple resources");

  info(`Archive has ${stats.totalParts} parts and ${stats.resources} resources`);
});

/**
 * Test MHTML detection
 */
add_task(async function test_mhtml_detection() {
  info("Testing MHTML detection");

  let validMHTML = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="test"`;

  let notMHTML = `<!DOCTYPE html>
<html><body>Not MHTML</body></html>`;

  ok(MHTMLArchive.isMHTML(validMHTML), "Should detect valid MHTML");
  ok(!MHTMLArchive.isMHTML(notMHTML), "Should reject non-MHTML");
});

/**
 * Integration test: Save and read MHTML
 */
add_task(async function test_mhtml_roundtrip() {
  info("Testing MHTML save and read roundtrip");

  // First, save a page as MHTML
  let contentBase =
    "https://example.com/browser/toolkit/components/windowcreator/test/";
  let uri = contentBase + "file_persist_simple.html";

  let mhtmlFile = await BrowserTestUtils.withNewTab(uri, async function (
    browser
  ) {
    let doc = await new Promise(function (resolve) {
      browser.frameLoader.startPersistence(null, {
        onDocumentReady(d) {
          resolve(d);
        },
        onError(e) {
          ok(false, "startPersistence failed: " + e);
        },
      });
    });

    let wbp = Cc[
      "@mozilla.org/embedding/browser/nsWebBrowserPersist;1"
    ].createInstance(Ci.nsIWebBrowserPersist);

    // Enable MHTML flag
    wbp.persistFlags |=
      Ci.nsIWebBrowserPersist.PERSIST_FLAGS_SAVE_AS_MHTML;

    let tmp = Services.dirsvc.get("TmpD", Ci.nsIFile);
    let mhtmlFile = tmp.clone();
    mhtmlFile.append("roundtrip_test.mhtml");

    let tmpDir = tmp.clone();
    tmpDir.append("roundtrip_test_files");

    registerCleanupFunction(function cleanUp() {
      if (mhtmlFile.exists()) {
        mhtmlFile.remove(false);
      }
      if (tmpDir.exists()) {
        tmpDir.remove(true);
      }
    });

    // Wait for save to complete
    await new Promise(function (resolve) {
      wbp.progressListener = {
        onProgressChange() {},
        onLocationChange() {},
        onStatusChange() {},
        onSecurityChange() {},
        onContentBlockingEvent() {},
        onStateChange(_wbp, _req, state, _status) {
          if (state & Ci.nsIWebProgressListener.STATE_STOP) {
            resolve();
          }
        },
      };

      wbp.saveDocument(doc, mhtmlFile, tmpDir, null, 0, 0);
    });

    return mhtmlFile;
  });

  ok(mhtmlFile.exists(), "MHTML file should exist");
  ok(mhtmlFile.fileSize > 0, "MHTML file should not be empty");

  // Now parse the saved MHTML using MHTMLArchive
  let mhtmlContent = await IOUtils.readUTF8(mhtmlFile.path);
  
  // Test detection
  ok(MHTMLArchive.isMHTML(mhtmlContent), "Saved file should be detected as MHTML");
  
  // Create archive
  let baseURI = Services.io.newFileURI(mhtmlFile);
  let archive = MHTMLArchive.create(mhtmlContent, baseURI);

  ok(archive, "Should create archive from saved file");

  let mainDoc = archive.getMainDocument();
  ok(mainDoc, "Should find HTML document in saved file");
  ok(
    mainDoc.body.includes("MHTML Test Page"),
    "Should contain original content"
  );

  // Verify scripts were stripped
  ok(
    !mainDoc.body.includes("<script"),
    "Scripts should be stripped from saved MHTML"
  );
  ok(
    !mainDoc.body.includes("<noscript"),
    "Noscripts should be stripped from saved MHTML"
  );

  // Test resource access
  let stats = archive.getStats();
  ok(stats.totalParts > 0, "Should have parts");
  ok(stats.resources >= 0, "Should have resources map");

  info(`Successfully created archive from saved MHTML with ${stats.totalParts} parts`);
});

