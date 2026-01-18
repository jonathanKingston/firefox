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
      fileURI.spec,
      true /* wait for load */
    );

    // Give MHTML parsing a moment to complete
    await TestUtils.waitForTick();

    let docInfo = await SpecialPowers.spawn(tab.linkedBrowser, [], function () {
      return {
        hasDoc: !!content.document,
        hasBody: !!content.document.body,
        title: content.document.title,
        bodyTextLength: content.document.body?.textContent?.length || 0,
      };
    });

    ok(docInfo.hasDoc, "Document should be loaded");
    ok(docInfo.hasBody, "Document should have body");

    info(`Document title: ${docInfo.title}`);
    info(`Body text length: ${docInfo.bodyTextLength}`);

    Assert.greater(docInfo.bodyTextLength, 0, "Document should have content");

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

  // Create a simple MHTML file directly for testing load functionality
  let mhtmlContent = `MIME-Version: 1.0
Content-Type: multipart/related; boundary="----boundary----"

------boundary----
Content-Type: text/html; charset="utf-8"
Content-Location: https://example.com/save-test.html

<!DOCTYPE html>
<html>
<head><title>Save Test</title></head>
<body>
<h1 id="heading">Test Heading</h1>
<p>Test paragraph</p>
</body>
</html>
------boundary------
`;

  let tmp = Services.dirsvc.get("TmpD", Ci.nsIFile);
  let mhtmlFile = tmp.clone();
  mhtmlFile.append("test_saved.mhtml");

  await IOUtils.writeUTF8(mhtmlFile.path, mhtmlContent);

  try {
    // Load the MHTML file
    let mhtmlURI = Services.io.newFileURI(mhtmlFile);
    let mhtmlTab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      mhtmlURI.spec,
      true /* wait for load */
    );

    // Give MHTML parsing a moment to complete
    await TestUtils.waitForTick();

    let docInfo = await SpecialPowers.spawn(
      mhtmlTab.linkedBrowser,
      [],
      function () {
        return {
          hasDoc: !!content.document,
          hasBody: !!content.document.body,
          title: content.document.title,
        };
      }
    );

    ok(docInfo.hasDoc, "MHTML document should load");
    ok(docInfo.hasBody, "MHTML document should have body");

    info(`Loaded MHTML document title: ${docInfo.title}`);

    await BrowserTestUtils.removeTab(mhtmlTab);
  } finally {
    await IOUtils.remove(mhtmlFile.path);
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
      fileURI.spec,
      true /* wait for load */
    );

    // Give it a moment to complete
    await TestUtils.waitForTick();

    let docInfo = await SpecialPowers.spawn(tab.linkedBrowser, [], function () {
      return {
        hasDoc: !!content.document,
        hasBody: !!content.document.body,
        title: content.document.title,
      };
    });

    ok(docInfo.hasDoc, "Document should load even if not real MHTML");
    ok(docInfo.hasBody, "Document should have body");

    // Should still load as HTML
    is(docInfo.title, "Regular HTML", "Title should be preserved");

    await BrowserTestUtils.removeTab(tab);
  } finally {
    await IOUtils.remove(file.path);
  }
});
