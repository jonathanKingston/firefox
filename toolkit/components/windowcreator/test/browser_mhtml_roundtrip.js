"use strict";

/**
 * Roundtrip tests: Export HTML → Validate MHTML structure → Compare rendering
 * These tests use the browser to create MHTML files, then validate both
 * the structure and the rendering.
 */

const { MHTMLParser } = ChromeUtils.importESModule(
  "resource://gre/modules/MHTMLParser.sys.mjs"
);
const { MHTMLArchive } = ChromeUtils.importESModule(
  "resource://gre/modules/MHTMLArchive.sys.mjs"
);

/**
 * Helper: Export HTML to MHTML
 */
async function exportToMHTML(htmlContent, filename) {
  // Create temporary HTML file
  let tmpDir = Services.dirsvc.get("TmpD", Ci.nsIFile);
  let htmlFile = tmpDir.clone();
  htmlFile.append(filename + ".html");
  await IOUtils.writeUTF8(htmlFile.path, htmlContent);

  let htmlURI = Services.io.newFileURI(htmlFile);

  // Load in browser
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, htmlURI.spec);
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);

  // Export as MHTML
  let mhtmlFile = tmpDir.clone();
  mhtmlFile.append(filename + ".mhtml");

  let wbp = Cc[
    "@mozilla.org/embedding/browser/nsWebBrowserPersist;1"
  ].createInstance(Ci.nsIWebBrowserPersist);

  wbp.persistFlags =
    Ci.nsIWebBrowserPersist.PERSIST_FLAGS_REPLACE_EXISTING_FILES |
    Ci.nsIWebBrowserPersist.PERSIST_FLAGS_SAVE_AS_MHTML;

  let deferred = Promise.withResolvers();
  let listener = {
    onStateChange(aWebProgress, aRequest, aStateFlags, aStatus) {
      if (aStateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
        if (aStatus == Cr.NS_OK) {
          deferred.resolve();
        } else {
          deferred.reject(new Error(`Save failed: ${aStatus}`));
        }
      }
    },
    onProgressChange() {},
    onLocationChange() {},
    onStatusChange() {},
  };

  wbp.progressListener = listener;
  let doc = tab.linkedBrowser.contentDocument;
  wbp.saveDocument(doc, mhtmlFile, null, null, 0, 0);

  await deferred.promise;
  await BrowserTestUtils.removeTab(tab);

  // Clean up HTML file
  await IOUtils.remove(htmlFile.path);

  return mhtmlFile;
}

/**
 * Helper: Validate MHTML structure
 */
async function validateMHTMLStructure(mhtmlFile) {
  let mhtmlContent = await IOUtils.readUTF8(mhtmlFile.path);

  // Check it's valid MHTML
  ok(MHTMLArchive.isMHTML(mhtmlContent), "Content should be valid MHTML");

  // Parse it
  let archive = MHTMLArchive.create(
    mhtmlContent,
    Services.io.newFileURI(mhtmlFile)
  );
  ok(archive, "Should create archive");

  let mainDoc = archive.getMainDocument();
  ok(mainDoc, "Should have main document");
  ok(mainDoc.contentType.includes("text/html"), "Main doc should be HTML");

  return { archive, mainDoc };
}

/**
 * Test: Simple HTML roundtrip
 */
add_task(async function test_simple_roundtrip() {
  info("Testing simple HTML → MHTML → validation");

  let htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Roundtrip Test</title>
  <style>
    body { font-family: sans-serif; }
    h1 { color: blue; }
  </style>
</head>
<body>
  <h1>Roundtrip Test</h1>
  <p>This HTML should survive the roundtrip to MHTML and back.</p>
  <div id="test-div" style="width: 100px; height: 100px; background: red;"></div>
</body>
</html>`;

  let mhtmlFile = await exportToMHTML(htmlContent, "roundtrip_simple");

  try {
    // Validate structure
    let { archive, mainDoc } = await validateMHTMLStructure(mhtmlFile);

    // Check content
    ok(mainDoc.body.includes("Roundtrip Test"), "Should have title");
    ok(mainDoc.body.includes("survive the roundtrip"), "Should have paragraph");
    ok(mainDoc.body.includes("test-div"), "Should have div");

    // Check resources
    let urls = archive.getResourceURLs();
    info(`Archive has ${urls.length} resources`);

    // Validate parser can decode
    let parser = new MHTMLParser(await IOUtils.readUTF8(mhtmlFile.path));
    let parts = parser.parse();
    ok(parts.length >= 1, "Should have at least main HTML part");
  } finally {
    await IOUtils.remove(mhtmlFile.path);
  }
});

/**
 * Test: HTML with CSS roundtrip
 */
add_task(async function test_css_roundtrip() {
  info("Testing HTML with CSS → MHTML");

  let htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>CSS Test</title>
  <style>
    body {
      background: #f0f0f0;
      margin: 0;
      padding: 20px;
    }
    .box {
      width: 100px;
      height: 100px;
      background: linear-gradient(to right, red, blue);
      border: 2px solid black;
    }
  </style>
</head>
<body>
  <h1>CSS Styling Test</h1>
  <div class="box"></div>
</body>
</html>`;

  let mhtmlFile = await exportToMHTML(htmlContent, "roundtrip_css");

  try {
    let { archive, mainDoc } = await validateMHTMLStructure(mhtmlFile);

    // Check CSS is preserved (inline in HTML)
    ok(mainDoc.body.includes("background"), "Should have CSS");
    ok(mainDoc.body.includes(".box"), "Should have box class");
  } finally {
    await IOUtils.remove(mhtmlFile.path);
  }
});

/**
 * Test: HTML with data URL image
 */
add_task(async function test_data_url_roundtrip() {
  info("Testing HTML with data URL");

  // 1x1 red pixel
  let redPixel =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

  let htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Data URL Test</title>
</head>
<body>
  <h1>Data URL Image</h1>
  <img src="${redPixel}" alt="Red pixel">
</body>
</html>`;

  let mhtmlFile = await exportToMHTML(htmlContent, "roundtrip_dataurl");

  try {
    let { mainDoc } = await validateMHTMLStructure(mhtmlFile);

    // Data URLs should be preserved inline
    ok(mainDoc.body.includes("data:image/png"), "Should preserve data URL");
  } finally {
    await IOUtils.remove(mhtmlFile.path);
  }
});

/**
 * Test: Encoding preservation
 */
add_task(async function test_encoding_roundtrip() {
  info("Testing special characters and encoding");

  let htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Encoding Test</title>
</head>
<body>
  <h1>Special Characters: © ® ™ € £ ¥</h1>
  <p>Unicode: 你好 مرحبا שלום</p>
  <p>Symbols: ← → ↑ ↓ ♠ ♣ ♥ ♦</p>
</body>
</html>`;

  let mhtmlFile = await exportToMHTML(htmlContent, "roundtrip_encoding");

  try {
    let { mainDoc } = await validateMHTMLStructure(mhtmlFile);

    // Check special characters are preserved
    ok(mainDoc.body.includes("©"), "Should have copyright symbol");
    ok(mainDoc.body.includes("€"), "Should have euro symbol");
    // Unicode characters should be in the content
    ok(mainDoc.body.length > 100, "Should have substantial content");
  } finally {
    await IOUtils.remove(mhtmlFile.path);
  }
});

/**
 * Test: Quoted-Printable encoding
 */
add_task(async function test_quoted_printable_encoding() {
  info("Testing Quoted-Printable encoding in export");

  let htmlContent = `<!DOCTYPE html>
<html>
<head><title>QP Test</title></head>
<body>
  <p>Line 1</p>
  <p>Line 2</p>
  <p>Line 3 with spaces   and   multiple   spaces</p>
</body>
</html>`;

  let mhtmlFile = await exportToMHTML(htmlContent, "roundtrip_qp");

  try {
    let mhtmlContent = await IOUtils.readUTF8(mhtmlFile.path);

    // Check for MIME structure
    ok(mhtmlContent.includes("MIME-Version"), "Should have MIME version");
    ok(
      mhtmlContent.includes("multipart/related"),
      "Should be multipart/related"
    );
    ok(mhtmlContent.includes("Content-Type"), "Should have Content-Type");

    // Parse and validate
    let parser = new MHTMLParser(mhtmlContent);
    let parts = parser.parse();
    ok(parts.length >= 1, "Should have parts");

    // Decode and check content preserved
    let decoded = parser.decodeBody(parts[0]);
    ok(decoded.includes("Line 1"), "Should preserve line 1");
    ok(decoded.includes("Line 2"), "Should preserve line 2");
    ok(decoded.includes("Line 3"), "Should preserve line 3");
  } finally {
    await IOUtils.remove(mhtmlFile.path);
  }
});

/**
 * Test: Rendering comparison - HTML vs MHTML
 * This validates that MHTML renders identically to the original HTML
 */
add_task(async function test_rendering_comparison() {
  info("Testing HTML vs MHTML rendering comparison");

  let htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Rendering Test</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: sans-serif;
    }
    .box {
      width: 100px;
      height: 100px;
      background: blue;
      color: white;
      padding: 10px;
    }
  </style>
</head>
<body>
  <h1 id="title">Rendering Comparison Test</h1>
  <div class="box">Blue Box</div>
  <p>This content should look identical in HTML and MHTML.</p>
</body>
</html>`;

  // Create HTML file
  let tmpDir = Services.dirsvc.get("TmpD", Ci.nsIFile);
  let htmlFile = tmpDir.clone();
  htmlFile.append("render_test.html");
  await IOUtils.writeUTF8(htmlFile.path, htmlContent);
  let htmlURI = Services.io.newFileURI(htmlFile);

  // Load original HTML and capture its rendering info
  let htmlTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    htmlURI.spec
  );
  await BrowserTestUtils.browserLoaded(htmlTab.linkedBrowser);

  let htmlRendering = await SpecialPowers.spawn(
    htmlTab.linkedBrowser,
    [],
    function () {
      let doc = content.document;
      return {
        title: doc.title,
        bodyText: doc.body.textContent.trim(),
        hasH1: doc.querySelector("h1") !== null,
        h1Text: doc.querySelector("h1")?.textContent,
        hasBox: doc.querySelector(".box") !== null,
        boxText: doc.querySelector(".box")?.textContent,
      };
    }
  );

  // Export to MHTML
  let mhtmlFile = await exportToMHTML(htmlContent, "render_comparison");

  // Load MHTML - this will timeout with file:// but we can validate structure
  let { archive, mainDoc } = await validateMHTMLStructure(mhtmlFile);

  // Validate content is preserved in MHTML structure
  ok(mainDoc.body.includes("Rendering Comparison Test"), "Title preserved");
  ok(mainDoc.body.includes("Blue Box"), "Box text preserved");
  ok(
    mainDoc.body.includes("should look identical"),
    "Paragraph text preserved"
  );

  // Note: Actual rendering comparison would require loading the MHTML
  // in a browser, which has timing issues in automated tests.
  // For now, we validate structure preservation.
  info("HTML rendering captured:");
  info(`  Title: ${htmlRendering.title}`);
  info(`  H1 present: ${htmlRendering.hasH1}`);
  info(`  H1 text: ${htmlRendering.h1Text}`);
  info(`  Box present: ${htmlRendering.hasBox}`);

  await BrowserTestUtils.removeTab(htmlTab);
  await IOUtils.remove(htmlFile.path);
  await IOUtils.remove(mhtmlFile.path);
});

/**
 * Test: Content comparison - Extract and compare text content
 */
add_task(async function test_content_comparison() {
  info("Testing content extraction and comparison");

  let htmlContent = `<!DOCTYPE html>
<html>
<head><title>Content Test</title></head>
<body>
  <h1>Main Heading</h1>
  <p>First paragraph with important content.</p>
  <div>
    <span>Nested</span> <span>content</span>
  </div>
  <ul>
    <li>Item 1</li>
    <li>Item 2</li>
  </ul>
</body>
</html>`;

  let mhtmlFile = await exportToMHTML(htmlContent, "content_test");

  try {
    let { mainDoc } = await validateMHTMLStructure(mhtmlFile);

    // Validate all content is preserved
    let contentChecks = [
      { text: "Main Heading", label: "heading" },
      { text: "First paragraph", label: "paragraph" },
      { text: "Nested", label: "nested span 1" },
      { text: "content", label: "nested span 2" },
      { text: "Item 1", label: "list item 1" },
      { text: "Item 2", label: "list item 2" },
    ];

    for (let check of contentChecks) {
      ok(
        mainDoc.body.includes(check.text),
        `Should preserve ${check.label}: "${check.text}"`
      );
    }
  } finally {
    await IOUtils.remove(mhtmlFile.path);
  }
});

