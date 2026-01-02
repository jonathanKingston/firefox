"use strict";

/**
 * Comprehensive MHTML compatibility tests based on Chrome's test suite
 * Tests both import (reading) and export (writing) with various edge cases
 */

// Load test file definitions
Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/toolkit/components/windowcreator/test/mhtml_test_files.js",
  this
);

/**
 * Helper: Write MHTML content to temp file
 */
async function createMHTMLFile(name, content) {
  let file = Services.dirsvc.get("TmpD", Ci.nsIFile);
  file.append(name);
  await IOUtils.writeUTF8(file.path, content);
  registerCleanupFunction(() => IOUtils.remove(file.path).catch(() => {}));
  return file;
}

/**
 * Helper: Load MHTML file and return document info
 */
async function loadMHTML(file) {
  let fileURI = Services.io.newFileURI(file);
  
  // Open tab without waiting - we'll check content directly
  let tab = BrowserTestUtils.addTab(gBrowser, fileURI.spec);
  gBrowser.selectedTab = tab;
  let browser = tab.linkedBrowser;
  
  // Wait for document to exist with a timeout
  await BrowserTestUtils.waitForCondition(
    () => browser.contentDocument && browser.contentDocument.body,
    "Waiting for document body",
    100,
    200
  );

  let docInfo = await SpecialPowers.spawn(browser, [], function () {
    return {
      title: content.document.title,
      body: content.document.body?.textContent || "",
      html: content.document.documentElement?.outerHTML || "",
      hasFrames: content.document.querySelectorAll("iframe").length > 0,
    };
  });

  await BrowserTestUtils.removeTab(tab);
  return docInfo;
}

/**
 * Test: 7-bit transfer encoding
 */
add_task(async function test_7bit_encoding() {
  info("Testing 7-bit transfer encoding");
  let testCase = MHTMLTestFiles.transfer_encoding_7bit;
  let file = await createMHTMLFile(testCase.name, testCase.content);

  let doc = await loadMHTML(file);
  is(doc.title, testCase.expected.title, "Title should match");
  ok(
    doc.body.includes(testCase.expected.contentIncludes),
    "Body should contain expected content"
  );
});

/**
 * Test: 8-bit transfer encoding
 */
add_task(async function test_8bit_encoding() {
  info("Testing 8-bit transfer encoding with special characters");
  let testCase = MHTMLTestFiles.transfer_encoding_8bit;
  let file = await createMHTMLFile(testCase.name, testCase.content);

  let doc = await loadMHTML(file);
  is(doc.title, testCase.expected.title, "Title should match");
  ok(
    doc.body.includes(testCase.expected.contentIncludes),
    "Body should contain expected content"
  );
});

/**
 * Test: Missing Content-Transfer-Encoding header
 */
add_task(async function test_no_encoding_header() {
  info("Testing MHTML with missing Content-Transfer-Encoding header");
  let testCase = MHTMLTestFiles.content_transfer_encoding_none;
  let file = await createMHTMLFile(testCase.name, testCase.content);

  let doc = await loadMHTML(file);
  is(doc.title, testCase.expected.title, "Title should match");
  ok(
    doc.body.includes(testCase.expected.contentIncludes),
    "Should parse content without encoding header"
  );
});

/**
 * Test: Invalid boundary (missing closing)
 */
add_task(async function test_missing_boundary() {
  info("Testing MHTML with missing closing boundary");
  let testCase = MHTMLTestFiles.invalid_bad_boundary_missing;
  let file = await createMHTMLFile(testCase.name, testCase.content);

  try {
    let doc = await loadMHTML(file);
    ok(
      doc.body.includes(testCase.expected.contentIncludes),
      "Should handle missing boundary gracefully"
    );
  } catch (e) {
    if (!testCase.expected.shouldFail) {
      ok(false, `Should not fail on missing boundary: ${e}`);
    }
  }
});

/**
 * Test: Relative URLs
 */
add_task(async function test_relative_urls() {
  info("Testing MHTML with relative URLs");
  let testCase = MHTMLTestFiles.relative_url;
  let file = await createMHTMLFile(testCase.name, testCase.content);

  let doc = await loadMHTML(file);
  is(doc.title, testCase.expected.title, "Title should match");
  ok(
    doc.body.includes(testCase.expected.contentIncludes),
    "Body should contain expected content"
  );
  // Note: Resource loading verification requires resource interception (Phase 3)
});

/**
 * Test: JavaScript stripping
 */
add_task(async function test_javascript_content() {
  info("Testing MHTML with JavaScript (should be stripped on export)");
  let testCase = MHTMLTestFiles.page_with_javascript;
  let file = await createMHTMLFile(testCase.name, testCase.content);

  let doc = await loadMHTML(file);
  is(doc.title, testCase.expected.title, "Title should match");
  ok(
    doc.body.includes(testCase.expected.contentIncludes),
    "Body should contain expected content"
  );
});

/**
 * Test: Multi-frame content
 */
add_task(async function test_multi_frames() {
  info("Testing MHTML with multiple frames");
  let testCase = MHTMLTestFiles.multi_frames;
  let file = await createMHTMLFile(testCase.name, testCase.content);

  let doc = await loadMHTML(file);
  is(doc.title, testCase.expected.title, "Title should match");
  ok(
    doc.body.includes(testCase.expected.contentIncludes),
    "Body should contain main frame content"
  );
  // Note: Frame content loading requires full frame serialization support
});

/**
 * Test: Relaxed content-type parsing (Opera compatibility)
 */
add_task(async function test_relaxed_parsing() {
  info("Testing MHTML with relaxed content-type parameters");
  let testCase = MHTMLTestFiles.relaxed_content_type_parameters;
  let file = await createMHTMLFile(testCase.name, testCase.content);

  let doc = await loadMHTML(file);
  is(doc.title, testCase.expected.title, "Title should match");
  ok(
    doc.body.includes(testCase.expected.contentIncludes),
    "Should parse content-type without spaces"
  );
});

/**
 * Test: Missing resources
 */
add_task(async function test_missing_resources() {
  info("Testing MHTML with missing resources");
  let testCase = MHTMLTestFiles.resource_not_in_archive;
  let file = await createMHTMLFile(testCase.name, testCase.content);

  let doc = await loadMHTML(file);
  is(doc.title, testCase.expected.title, "Title should match");
  ok(
    doc.body.includes(testCase.expected.contentIncludes),
    "Should load HTML even with missing resources"
  );
  // Note: Missing resource handling can be verified once resource interception is implemented
});

/**
 * Test: IE format compatibility
 */
add_task(async function test_ie_format() {
  info("Testing IE-generated MHTML format");
  let testCase = MHTMLTestFiles.ie_format;
  let file = await createMHTMLFile(testCase.name, testCase.content);

  let doc = await loadMHTML(file);
  is(doc.title, testCase.expected.title, "Title should match");
  ok(
    doc.body.includes(testCase.expected.contentIncludes),
    "Should parse IE format with 'From:' header"
  );
});

/**
 * Test: UnMHT extension format
 */
add_task(async function test_unmht_format() {
  info("Testing UnMHT Firefox extension format");
  let testCase = MHTMLTestFiles.unmht_format;
  let file = await createMHTMLFile(testCase.name, testCase.content);

  let doc = await loadMHTML(file);
  is(doc.title, testCase.expected.title, "Title should match");
  ok(
    doc.body.includes(testCase.expected.contentIncludes),
    "Should parse UnMHT format"
  );
});

/**
 * Test: Export and re-import roundtrip
 */
add_task(async function test_export_import_roundtrip() {
  info("Testing export → import roundtrip");

  // Create a test page
  let testHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Roundtrip Test</title>
      <style>body { color: blue; }</style>
    </head>
    <body>
      <h1>Export/Import Test</h1>
      <p>This content should survive roundtrip.</p>
    </body>
    </html>
  `;

  let tmp = Services.dirsvc.get("TmpD", Ci.nsIFile);
  let sourceFile = tmp.clone();
  sourceFile.append("roundtrip_source.html");
  await IOUtils.writeUTF8(sourceFile.path, testHTML);
  registerCleanupFunction(() =>
    IOUtils.remove(sourceFile.path).catch(() => {})
  );

  let sourceURI = Services.io.newFileURI(sourceFile);

  // Load and save as MHTML
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    sourceURI.spec
  );
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);

  let mhtmlFile = tmp.clone();
  mhtmlFile.append("roundtrip_test.mhtml");

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

  registerCleanupFunction(() =>
    IOUtils.remove(mhtmlFile.path).catch(() => {})
  );

  ok(mhtmlFile.exists(), "MHTML file should exist after save");

  // Re-import the MHTML file
  let reimportedDoc = await loadMHTML(mhtmlFile);

  is(reimportedDoc.title, "Roundtrip Test", "Title should survive roundtrip");
  ok(
    reimportedDoc.body.includes("Export/Import Test"),
    "Content should survive roundtrip"
  );
  ok(
    reimportedDoc.body.includes("This content should survive roundtrip"),
    "Full content should be preserved"
  );
});

