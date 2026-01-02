"use strict";

/**
 * MHTML Reftest Generator
 * 
 * This test generates MHTML versions of HTML test files for use in reftests.
 * It validates that exporting HTML to MHTML preserves the visual rendering.
 * 
 * Usage:
 * 1. Run this test to generate .mhtml versions of test HTML files
 * 2. Run the reftest suite to compare rendering
 * 
 * The reftests compare:
 * - Original HTML (loaded directly)
 * - MHTML version (exported from HTML, then loaded)
 * 
 * If rendering is identical, the reftest passes.
 */

/**
 * Helper: Export HTML file to MHTML
 */
async function exportHTMLToMHTML(htmlFile, mhtmlFile) {
  let htmlURI = Services.io.newFileURI(htmlFile);

  // Load HTML in browser
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, htmlURI.spec);
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);

  // Export as MHTML
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
          deferred.reject(new Error(`Export failed: ${aStatus}`));
        }
      }
    },
    onProgressChange() {},
    onLocationChange() {},
    onStatusChange() {},
    onSecurityChange() {},
    onContentBlockingEvent() {},
  };

  wbp.progressListener = listener;

  let mhtmlURI = Services.io.newFileURI(mhtmlFile);
  wbp.saveDocument(
    tab.linkedBrowser.contentDocument,
    mhtmlURI,
    null,
    null,
    0,
    0
  );

  await deferred.promise;
  await BrowserTestUtils.removeTab(tab);
}

/**
 * Test: Generate MHTML files for reftests
 */
add_task(async function test_generate_reftest_mhtml_files() {
  info("Generating MHTML files for reftests");

  let reftestDir = PathUtils.join(
    PathUtils.parent(PathUtils.parent(PathUtils.parent(__filename))),
    "reftest"
  );

  let testFiles = [
    {
      html: "mhtml-basic-test.html",
      mhtml: "mhtml-basic-rendering.html",
    },
    {
      html: "mhtml-complex-layout.html",
      mhtml: "mhtml-complex-layout.html",
    },
  ];

  for (let { html, mhtml } of testFiles) {
    info(`Generating ${mhtml} from ${html}`);

    // Get source HTML file from reftest directory
    let htmlFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    htmlFile.initWithPath(PathUtils.join(reftestDir, html));

    // Create MHTML file in same directory
    let mhtmlFile = Cc["@mozilla.org/file/local;1"].createInstance(
      Ci.nsIFile
    );
    mhtmlFile.initWithPath(PathUtils.join(reftestDir, mhtml));

    try {
      await exportHTMLToMHTML(htmlFile, mhtmlFile);
      ok(await IOUtils.exists(mhtmlFile.path), `${mhtml} created successfully`);

      // Validate MHTML structure
      let content = await IOUtils.readUTF8(mhtmlFile.path);
      ok(content.includes("MIME-Version"), "Should have MIME version");
      ok(
        content.includes("multipart/related"),
        "Should be multipart/related"
      );

      info(`✓ Generated: ${mhtml}`);
    } catch (ex) {
      ok(false, `Failed to generate ${mhtml}: ${ex.message}`);
    }
  }
});

/**
 * Test: Validate reftest generation with content comparison
 */
add_task(async function test_validate_reftest_generation() {
  info("Validating that generated MHTML preserves content");

  let tmpDir = Services.dirsvc.get("TmpD", Ci.nsIFile);

  // Create a test HTML file
  let htmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>Reftest Validation</title>
  <style>
    body { background: #f0f0f0; padding: 20px; }
    .box { background: blue; color: white; padding: 10px; }
  </style>
</head>
<body>
  <h1>Reftest Content Test</h1>
  <div class="box">This is a blue box</div>
  <p>Paragraph content for validation.</p>
</body>
</html>`;

  let htmlFile = tmpDir.clone();
  htmlFile.append("reftest_validation.html");
  await IOUtils.writeUTF8(htmlFile.path, htmlContent);

  let mhtmlFile = tmpDir.clone();
  mhtmlFile.append("reftest_validation.mhtml");

  try {
    // Export to MHTML
    await exportHTMLToMHTML(htmlFile, mhtmlFile);

    // Validate MHTML structure and content
    let mhtmlContent = await IOUtils.readUTF8(mhtmlFile.path);

    ok(
      mhtmlContent.includes("Reftest Content Test"),
      "Title should be preserved"
    );
    ok(
      mhtmlContent.includes("This is a blue box"),
      "Box content should be preserved"
    );
    ok(
      mhtmlContent.includes("Paragraph content"),
      "Paragraph should be preserved"
    );
    ok(
      mhtmlContent.includes("background: blue"),
      "CSS should be preserved"
    );
  } finally {
    await IOUtils.remove(htmlFile.path);
    if (await IOUtils.exists(mhtmlFile.path)) {
      await IOUtils.remove(mhtmlFile.path);
    }
  }
});

/**
 * Test: Screenshot comparison (proof of concept)
 * 
 * Note: Full screenshot comparison requires reftest infrastructure.
 * This test demonstrates the concept using content checks.
 */
add_task(async function test_rendering_comparison_concept() {
  info("Demonstrating rendering comparison concept");

  let tmpDir = Services.dirsvc.get("TmpD", Ci.nsIFile);

  let htmlContent = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; font-family: Arial; }
    .header { background: linear-gradient(to right, blue, green); 
              color: white; padding: 20px; }
  </style>
</head>
<body>
  <div class="header">Header with gradient</div>
</body>
</html>`;

  let htmlFile = tmpDir.clone();
  htmlFile.append("render_compare.html");
  await IOUtils.writeUTF8(htmlFile.path, htmlContent);

  let mhtmlFile = tmpDir.clone();
  mhtmlFile.append("render_compare.mhtml");

  try {
    // Export to MHTML
    await exportHTMLToMHTML(htmlFile, mhtmlFile);

    // Load both and capture rendering info
    let htmlURI = Services.io.newFileURI(htmlFile);
    let htmlTab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      htmlURI.spec
    );
    await BrowserTestUtils.browserLoaded(htmlTab.linkedBrowser);

    let htmlInfo = await SpecialPowers.spawn(
      htmlTab.linkedBrowser,
      [],
      function () {
        let header = content.document.querySelector(".header");
        return {
          text: header.textContent,
          computed: content.getComputedStyle(header).background,
          color: content.getComputedStyle(header).color,
        };
      }
    );

    info("HTML rendering:");
    info(`  Text: ${htmlInfo.text}`);
    info(`  Background: ${htmlInfo.computed}`);
    info(`  Color: ${htmlInfo.color}`);

    // Note: MHTML comparison would happen here in full reftest
    // For now, we validate the content exists in MHTML
    let mhtmlContent = await IOUtils.readUTF8(mhtmlFile.path);
    ok(
      mhtmlContent.includes("Header with gradient"),
      "Content preserved in MHTML"
    );
    ok(
      mhtmlContent.includes("linear-gradient"),
      "CSS gradient preserved in MHTML"
    );

    await BrowserTestUtils.removeTab(htmlTab);
  } finally {
    await IOUtils.remove(htmlFile.path);
    if (await IOUtils.exists(mhtmlFile.path)) {
      await IOUtils.remove(mhtmlFile.path);
    }
  }
});

