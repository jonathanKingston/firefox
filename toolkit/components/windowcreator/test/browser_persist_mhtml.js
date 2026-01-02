"use strict";

const contentBase =
  "https://example.com/browser/toolkit/components/windowcreator/test/";

/**
 * Helper to save a page as MHTML and return the file
 */
async function saveAsMHTML(name, uri) {
  return BrowserTestUtils.withNewTab(uri, async function (browser) {
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
    wbp.persistFlags |= Ci.nsIWebBrowserPersist.PERSIST_FLAGS_SAVE_AS_MHTML;
    
    let tmp = Services.dirsvc.get("TmpD", Ci.nsIFile);
    let mhtmlFile = tmp.clone();
    mhtmlFile.append(name + "_saved.mhtml");
    
    // Note: filesFolder is required for resource discovery but won't create actual folder for MHTML
    let tmpDir = tmp.clone();
    tmpDir.append(name + "_files");

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
}

/**
 * Read MHTML file content
 */
async function readMHTML(file) {
  return IOUtils.readUTF8(file.path);
}

add_task(async function test_mhtml_basic() {
  info("Testing basic MHTML save functionality");
  
  let uri = contentBase + "file_persist_simple.html";
  let mhtmlFile = await saveAsMHTML("basic_test", uri);
  
  ok(mhtmlFile.exists(), "MHTML file should exist");
  ok(mhtmlFile.fileSize > 0, "MHTML file should not be empty");
  
  let content = await readMHTML(mhtmlFile);
  
  // Check MHTML structure
  ok(content.includes("MIME-Version: 1.0"), "Should have MIME-Version header");
  ok(content.includes("Content-Type: multipart/related"), "Should be multipart/related");
  ok(content.includes("boundary="), "Should have boundary");
  ok(content.includes("From: <Saved by Firefox>"), "Should have From header");
  
  // Check HTML content
  ok(content.includes("text/html"), "Should contain HTML content");
  ok(content.includes("MHTML Test Page"), "Should contain page title");
  
  // Check scripts are stripped
  ok(!content.includes("<script"), "Should not contain script tags");
  ok(!content.includes("<noscript"), "Should not contain noscript tags");
  ok(!content.includes("console.log"), "Should not contain script content");
  
  // Check resources are embedded
  ok(content.includes("Content-Transfer-Encoding: base64"), "Should have base64 encoded resources");
  
  info(`MHTML file size: ${mhtmlFile.fileSize} bytes`);
});

add_task(async function test_mhtml_no_files_folder() {
  info("Testing that _files folder is not created for MHTML");
  
  let uri = contentBase + "file_persist_simple.html";
  let name = "no_folder_test";
  let mhtmlFile = await saveAsMHTML(name, uri);
  
  let tmp = Services.dirsvc.get("TmpD", Ci.nsIFile);
  let tmpDir = tmp.clone();
  tmpDir.append(name + "_files");
  
  ok(!tmpDir.exists(), "_files folder should not exist for MHTML saves");
  ok(mhtmlFile.exists(), "MHTML file should exist");
});

