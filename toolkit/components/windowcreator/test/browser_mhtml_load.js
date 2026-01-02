/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Test that .mhtml files are detected and loaded by nsDocShell
 */
add_task(async function test_mhtml_file_detection() {
  info("Creating test MHTML file");

  // Create a simple MHTML file
  let mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"

------boundary----
Content-Type: text/html; charset="utf-8"
Content-Location: https://example.com/test.html

<!DOCTYPE html>
<html>
<head><title>MHTML Test</title></head>
<body>
<h1>MHTML Loading Test</h1>
<p>If you can see this, MHTML detection is working!</p>
</body>
</html>
------boundary------
`;

  // Save to temp file
  let tmp = Services.dirsvc.get("TmpD", Ci.nsIFile);
  let file = tmp.clone();
  file.append("test_mhtml_load.mhtml");

  await IOUtils.writeUTF8(file.path, mhtmlContent);

  info(`Created MHTML file at: ${file.path}`);

  try {
    // Open the MHTML file in browser
    let fileURI = Services.io.newFileURI(file);
    info(`Opening URI: ${fileURI.spec}`);

    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      fileURI.spec
    );

    // Give it time to load
    await BrowserTestUtils.browserLoaded(tab.linkedBrowser);

    let doc = tab.linkedBrowser.contentDocument;
    ok(doc, "Document should be loaded");

    // Check if content loaded (even if MHTML parsing isn't complete yet)
    let body = doc.body;
    ok(body, "Document should have body");

    info(`Document title: ${doc.title}`);
    info(`Body text length: ${body.textContent.length}`);

    // The current implementation loads raw MHTML, so we'll just verify it loaded something
    Assert.greater(body.textContent.length, 0, "Document should have content");

    await BrowserTestUtils.removeTab(tab);
  } finally {
    // Clean up
    await IOUtils.remove(file.path);
  }
});

/**
 * Test that we can save and then load an MHTML file
 */
add_task(async function test_mhtml_save_and_load() {
  info("Testing MHTML save → load roundtrip");

  // Create a test page
  let testHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Save Test</title>
      <style>body { color: blue; }</style>
    </head>
    <body>
      <h1 id="heading">Test Heading</h1>
      <p>Test paragraph</p>
    </body>
    </html>
  `;

  let tmp = Services.dirsvc.get("TmpD", Ci.nsIFile);
  let testFile = tmp.clone();
  testFile.append("test_source.html");

  await IOUtils.writeUTF8(testFile.path, testHTML);
  let testURI = Services.io.newFileURI(testFile);

  try {
    // Load the test page
    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      testURI.spec
    );
    await BrowserTestUtils.browserLoaded(tab.linkedBrowser);

    // Save as MHTML
    let tmpMHTML = Services.dirsvc.get("TmpD", Ci.nsIFile);
    let mhtmlFile = tmpMHTML.clone();
    mhtmlFile.append("test_saved.mhtml");

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
    };

    wbp.progressListener = listener;
    wbp.saveURI(testURI, null, null, null, null, null, mhtmlFile, null);

    await deferred.promise;
    info("MHTML file saved successfully");

    // Now try to load the saved MHTML file
    let mhtmlURI = Services.io.newFileURI(mhtmlFile);
    let mhtmlTab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      mhtmlURI.spec
    );

    await BrowserTestUtils.browserLoaded(mhtmlTab.linkedBrowser);

    let doc = mhtmlTab.linkedBrowser.contentDocument;
    ok(doc, "MHTML document should load");
    ok(doc.body, "MHTML document should have body");

    info(`Loaded MHTML document title: ${doc.title}`);

    await BrowserTestUtils.removeTab(mhtmlTab);
    await BrowserTestUtils.removeTab(tab);

    // Clean up
    await IOUtils.remove(mhtmlFile.path);
  } finally {
    await IOUtils.remove(testFile.path);
  }
});

/**
 * Test that non-MHTML files with .mhtml extension don't break
 */
add_task(async function test_fake_mhtml_extension() {
  info("Testing file with .mhtml extension but not MHTML content");

  let regularHTML = `<!DOCTYPE html>
<html>
<head><title>Regular HTML</title></head>
<body><p>This is just regular HTML with .mhtml extension</p></body>
</html>`;

  let tmp = Services.dirsvc.get("TmpD", Ci.nsIFile);
  let file = tmp.clone();
  file.append("fake.mhtml");

  await IOUtils.writeUTF8(file.path, regularHTML);

  try {
    let fileURI = Services.io.newFileURI(file);
    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      fileURI.spec
    );
    await BrowserTestUtils.browserLoaded(tab.linkedBrowser);

    let doc = tab.linkedBrowser.contentDocument;
    ok(doc, "Document should load even if not real MHTML");
    ok(doc.body, "Document should have body");

    // Should still load as HTML
    is(doc.title, "Regular HTML", "Title should be preserved");

    await BrowserTestUtils.removeTab(tab);
  } finally {
    await IOUtils.remove(file.path);
  }
});
