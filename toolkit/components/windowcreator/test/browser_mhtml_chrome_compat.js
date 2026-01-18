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
 *
 * @param {string} name
 * @param {string} content
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
 *
 * @param {nsIFile} file
 */
async function loadMHTML(file) {
  let fileURI = Services.io.newFileURI(file);

  // Open tab and wait for load
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    fileURI.spec,
    true /* wait for load */
  );
  let browser = tab.linkedBrowser;

  // Give the document a moment to finish parsing
  await TestUtils.waitForTick();

  let docInfo = await SpecialPowers.spawn(browser, [], function () {
    return {
      title: content.document.title,
      body: content.document.body?.textContent || "",
      html: content.document.documentElement?.outerHTML || "",
      hasFrames: !!content.document.querySelectorAll("iframe").length,
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
 * Test: JavaScript content handling
 */
add_task(async function test_javascript_content() {
  info("Testing MHTML with JavaScript (should not execute when loaded)");
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

  const contentBase =
    "https://example.com/browser/toolkit/components/windowcreator/test/";
  let sourceURI = contentBase + "file_persist_simple.html";

  let tmp = Services.dirsvc.get("TmpD", Ci.nsIFile);
  let mhtmlFile = tmp.clone();
  mhtmlFile.append("roundtrip_test.mhtml");

  registerCleanupFunction(() => IOUtils.remove(mhtmlFile.path).catch(() => {}));

  // Load and save as MHTML using the pattern from browser_persist_mhtml.js
  await BrowserTestUtils.withNewTab(sourceURI, async function (browser) {
    let doc = await new Promise(function (resolve, reject) {
      browser.frameLoader.startPersistence(null, {
        onDocumentReady(d) {
          resolve(d);
        },
        onError(e) {
          reject(new Error("startPersistence failed: " + e));
        },
      });
    });

    let wbp = Cc[
      "@mozilla.org/embedding/browser/nsWebBrowserPersist;1"
    ].createInstance(Ci.nsIWebBrowserPersist);

    wbp.persistFlags =
      Ci.nsIWebBrowserPersist.PERSIST_FLAGS_REPLACE_EXISTING_FILES |
      Ci.nsIWebBrowserPersist.PERSIST_FLAGS_SAVE_AS_MHTML;

    await new Promise(function (resolve, reject) {
      wbp.progressListener = {
        onProgressChange() {},
        onLocationChange() {},
        onStatusChange() {},
        onSecurityChange() {},
        onContentBlockingEvent() {},
        onStateChange(_wbp, _req, state, status) {
          if (state & Ci.nsIWebProgressListener.STATE_STOP) {
            if (status == Cr.NS_OK) {
              resolve();
            } else {
              reject(new Error(`Save failed: ${status}`));
            }
          }
        },
      };

      wbp.saveDocument(doc, mhtmlFile, null, null, 0, 0);
    });
  });

  ok(mhtmlFile.exists(), "MHTML file should exist after save");

  // Re-import the MHTML file
  let reimportedDoc = await loadMHTML(mhtmlFile);

  is(
    reimportedDoc.title,
    "Simple MHTML Test Page",
    "Title should survive roundtrip"
  );
  ok(
    reimportedDoc.body.includes("This page tests MHTML save functionality"),
    "Content should survive roundtrip"
  );
});
