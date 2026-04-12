/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const OUTER_POST_FORM_URL =
  "http://mochi.test:8888/browser/toolkit/content/tests/browser/data/post_form_outer.sjs";

let MockFilePicker = SpecialPowers.MockFilePicker;
MockFilePicker.init(window.browsingContext);

add_task(async function test_inner_frame_save_uses_inner_post_data_only() {
  let saveConverterPref = "browser.download.save_converter_index";
  let hadSaveConverterPref = Services.prefs.prefHasUserValue(saveConverterPref);
  let oldSaveConverterPref = hadSaveConverterPref
    ? Services.prefs.getIntPref(saveConverterPref)
    : null;

  let browser = gBrowser.selectedBrowser;
  BrowserTestUtils.startLoadingURIString(gBrowser, OUTER_POST_FORM_URL);
  await BrowserTestUtils.browserLoaded(browser, false, OUTER_POST_FORM_URL);

  await SpecialPowers.spawn(browser, [], async () => {
    content.document.getElementById("postForm").submit();
  });

  await BrowserTestUtils.browserLoaded(browser, false, OUTER_POST_FORM_URL);

  await SpecialPowers.spawn(browser, [], async () => {
    await ContentTaskUtils.waitForCondition(
      () =>
        content.document.body.textContent.includes("inputfield=outer") &&
        !!content.document
          .getElementById("innerFrame")
          ?.contentDocument?.getElementById("postForm"),
      "Outer POST result and inner frame form should load"
    );
  });

  await SpecialPowers.spawn(browser, [], async () => {
    let frame = content.document.getElementById("innerFrame");
    frame.contentDocument.getElementById("postForm").submit();
  });

  await SpecialPowers.spawn(browser, [], async () => {
    await ContentTaskUtils.waitForCondition(
      () =>
        content.document
          .getElementById("innerFrame")
          ?.contentDocument?.body?.textContent.includes(
            "Inner POST data: inputfield=inner"
          ),
      "Inner frame POST result should load"
    );
  });

  let innerFrameBrowsingContextId = await SpecialPowers.spawn(
    browser,
    [],
    async () => content.document.getElementById("innerFrame").browsingContext.id
  );
  let innerFrameBrowsingContext = BrowsingContext.get(
    innerFrameBrowsingContextId
  );
  ok(innerFrameBrowsingContext, "Inner frame browsing context should exist");

  let destDir = createTemporarySaveDirectory();
  let file = destDir.clone();
  file.append("no_default_file_name");
  MockFilePicker.setFiles([file]);
  MockFilePicker.showCallback = fp => {
    fp.filterIndex = 1; // kSaveAsType_URL
  };

  registerCleanupFunction(() => {
    if (hadSaveConverterPref) {
      Services.prefs.setIntPref(saveConverterPref, oldSaveConverterPref);
    } else if (Services.prefs.prefHasUserValue(saveConverterPref)) {
      Services.prefs.clearUserPref(saveConverterPref);
    }
    mockTransferRegisterer.unregister();
    MockFilePicker.cleanup();
    destDir.remove(true);
  });

  let transferResult;
  mockTransferCallback = success => {
    transferResult = success;
  };
  mockTransferRegisterer.register();

  saveBrowser(browser, false, innerFrameBrowsingContext);

  await TestUtils.waitForCondition(
    () => transferResult !== undefined,
    "Save should complete",
    100,
    30000
  );
  let downloadSuccess = transferResult;
  ok(
    downloadSuccess,
    "The inner frame should have been downloaded successfully"
  );

  let savedFile = MockFilePicker.getNsIFile();
  let fileContents = readShortFile(savedFile);

  is(
    fileContents.indexOf("inputfield=outer"),
    -1,
    "The saved inner frame should not contain outer POST data"
  );
  isnot(
    fileContents.indexOf("inputfield=inner"),
    -1,
    "The saved inner frame should contain inner POST data"
  );
});

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/toolkit/content/tests/browser/common/mockTransfer.js",
  this
);

function createTemporarySaveDirectory() {
  let saveDir = Services.dirsvc.get("TmpD", Ci.nsIFile);
  saveDir.append("testsavedir");
  if (!saveDir.exists()) {
    saveDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
  }
  return saveDir;
}

/**
 * Reads the contents of the provided short file (up to 1 MiB).
 *
 * @param aFile
 *        nsIFile object pointing to the file to be read.
 *
 * @return
 *        String containing the raw octets read from the file.
 */
function readShortFile(aFile) {
  let inputStream = Cc[
    "@mozilla.org/network/file-input-stream;1"
  ].createInstance(Ci.nsIFileInputStream);
  inputStream.init(aFile, -1, 0, 0);
  try {
    let scrInputStream = Cc[
      "@mozilla.org/scriptableinputstream;1"
    ].createInstance(Ci.nsIScriptableInputStream);
    scrInputStream.init(inputStream);
    try {
      // Assume that the file is much shorter than 1 MiB.
      return scrInputStream.read(1048576);
    } finally {
      // Close the scriptable stream after reading, even if the operation
      // failed.
      scrInputStream.close();
    }
  } finally {
    // Close the stream after reading, if it is still open, even if the read
    // operation failed.
    inputStream.close();
  }
}
