"use strict";

/**
 * Test: Network isolation for MHTML files
 * Ensures that MHTML files NEVER trigger external network requests
 */

const { MHTMLParser } = ChromeUtils.importESModule(
  "resource://gre/modules/MHTMLParser.sys.mjs"
);
const { MHTMLArchive } = ChromeUtils.importESModule(
  "resource://gre/modules/MHTMLArchive.sys.mjs"
);

/**
 * Network activity observer to catch any network requests
 */
class NetworkMonitor {
  constructor() {
    this.requests = [];
    this.observer = {
      observeActivity: (
        aHttpChannel,
        aActivityType,
        aActivitySubtype,
        aTimestamp,
        aExtraSizeData,
        aExtraStringData
      ) => {
        if (
          aActivityType ===
          Ci.nsIHttpActivityObserver.ACTIVITY_TYPE_HTTP_TRANSACTION
        ) {
          if (
            aActivitySubtype ===
            Ci.nsIHttpActivityObserver.ACTIVITY_SUBTYPE_REQUEST_HEADER
          ) {
            try {
              let channel = aHttpChannel.QueryInterface(Ci.nsIHttpChannel);
              this.requests.push({
                url: channel.URI.spec,
                method: channel.requestMethod,
              });
            } catch (e) {
              // Ignore query interface errors
            }
          }
        }
      },
    };
  }

  start() {
    this.requests = [];
    let activityDistributor = Cc[
      "@mozilla.org/network/http-activity-distributor;1"
    ].getService(Ci.nsIHttpActivityDistributor);
    activityDistributor.addObserver(this.observer);
  }

  stop() {
    let activityDistributor = Cc[
      "@mozilla.org/network/http-activity-distributor;1"
    ].getService(Ci.nsIHttpActivityDistributor);
    activityDistributor.removeObserver(this.observer);
  }

  getRequests() {
    return this.requests;
  }
}

/**
 * Helper: Create MHTML with external references
 */
function createMHTMLWithExternalRefs() {
  return `MIME-Version: 1.0
From: <Saved by Firefox>
Subject: Test Page
Content-Type: multipart/related;
\ttype="text/html";
\tboundary="----MultipartBoundary"

------MultipartBoundary
Content-Type: text/html; charset=utf-8
Content-Location: http://example.com/test.html
Content-Transfer-Encoding: quoted-printable

<!DOCTYPE html>
<html>
<head>
  <title>Network Test</title>
  <link rel=3D"stylesheet" href=3D"http://external.example.com/style.css">
</head>
<body>
  <h1>Network Isolation Test</h1>
  <img src=3D"http://external.example.com/image.png" alt=3D"External Image">
  <img src=3D"https://external.example.com/another.png" alt=3D"Another">
  <script src=3D"http://external.example.com/script.js"></script>
  <iframe src=3D"http://external.example.com/frame.html"></iframe>
</body>
</html>

------MultipartBoundary--
`;
}

/**
 * Helper: Save MHTML content to temp file
 */
async function saveMHTMLToFile(content, filename) {
  let tmpDir = Services.dirsvc.get("TmpD", Ci.nsIFile);
  let file = tmpDir.clone();
  file.append(filename);
  await IOUtils.writeUTF8(file.path, content);
  return file;
}

/**
 * Test: Ensure no network requests when loading MHTML
 */
add_task(async function test_no_network_requests() {
  info("Testing that MHTML loading triggers ZERO network requests");

  // Create MHTML with external references
  let mhtmlContent = createMHTMLWithExternalRefs();
  let mhtmlFile = await saveMHTMLToFile(
    mhtmlContent,
    "network_test.mhtml"
  );

  try {
    let mhtmlURI = Services.io.newFileURI(mhtmlFile);

    // Start network monitoring
    let monitor = new NetworkMonitor();
    monitor.start();

    // Load MHTML file
    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      mhtmlURI.spec,
      false
    );

    // Wait for page to settle
    await BrowserTestUtils.waitForContentEvent(
      tab.linkedBrowser,
      "DOMContentLoaded",
      true
    );

    // Give it extra time for any delayed requests
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Stop monitoring and check
    monitor.stop();
    let requests = monitor.getRequests();

    // Filter out about:, chrome:, resource: URLs (internal)
    let externalRequests = requests.filter(
      req =>
        req.url.startsWith("http://") || req.url.startsWith("https://")
    );

    // Assert: ZERO external network requests
    is(
      externalRequests.length,
      0,
      "MHTML file must not trigger any external network requests"
    );

    if (externalRequests.length > 0) {
      info("UNEXPECTED external requests detected:");
      for (let req of externalRequests) {
        info(`  - ${req.method} ${req.url}`);
      }
    }

    await BrowserTestUtils.removeTab(tab);
  } finally {
    await IOUtils.remove(mhtmlFile.path);
  }
});

/**
 * Test: Content Security Policy blocks network requests
 */
add_task(async function test_csp_blocks_network() {
  info("Testing CSP prevents network requests from MHTML");

  let mhtmlContent = createMHTMLWithExternalRefs();
  let mhtmlFile = await saveMHTMLToFile(mhtmlContent, "csp_test.mhtml");

  try {
    let mhtmlURI = Services.io.newFileURI(mhtmlFile);
    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      mhtmlURI.spec,
      false
    );

    await BrowserTestUtils.waitForContentEvent(
      tab.linkedBrowser,
      "DOMContentLoaded",
      true
    );

    // Check that images with external sources didn't load
    let imageStatus = await SpecialPowers.spawn(
      tab.linkedBrowser,
      [],
      function () {
        let images = content.document.querySelectorAll("img");
        let results = [];
        for (let img of images) {
          results.push({
            src: img.src,
            complete: img.complete,
            naturalWidth: img.naturalWidth,
          });
        }
        return results;
      }
    );

    // All external images should fail to load (naturalWidth = 0)
    for (let img of imageStatus) {
      if (img.src.startsWith("http://") || img.src.startsWith("https://")) {
        is(
          img.naturalWidth,
          0,
          `External image should not load: ${img.src}`
        );
      }
    }

    await BrowserTestUtils.removeTab(tab);
  } finally {
    await IOUtils.remove(mhtmlFile.path);
  }
});

/**
 * Test: Compare network activity - MHTML vs regular HTML
 */
add_task(async function test_compare_network_activity() {
  info("Comparing network activity: regular HTML vs MHTML");

  // 1. Load regular HTML with external references
  let htmlContent = `<!DOCTYPE html>
<html>
<head><title>Network Test</title></head>
<body>
  <img src="http://example.com/external.png" alt="External">
  <link rel="stylesheet" href="http://example.com/style.css">
</body>
</html>`;

  let tmpDir = Services.dirsvc.get("TmpD", Ci.nsIFile);
  let htmlFile = tmpDir.clone();
  htmlFile.append("network_html_test.html");
  await IOUtils.writeUTF8(htmlFile.path, htmlContent);
  let htmlURI = Services.io.newFileURI(htmlFile);

  let htmlMonitor = new NetworkMonitor();
  htmlMonitor.start();

  let htmlTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    htmlURI.spec,
    false
  );
  await BrowserTestUtils.waitForContentEvent(
    htmlTab.linkedBrowser,
    "DOMContentLoaded",
    true
  );
  await new Promise(resolve => setTimeout(resolve, 1000));

  htmlMonitor.stop();
  let htmlRequests = htmlMonitor
    .getRequests()
    .filter(
      req =>
        req.url.startsWith("http://") || req.url.startsWith("https://")
    );

  await BrowserTestUtils.removeTab(htmlTab);
  await IOUtils.remove(htmlFile.path);

  // 2. Load MHTML with same external references
  let mhtmlContent = createMHTMLWithExternalRefs();
  let mhtmlFile = await saveMHTMLToFile(
    mhtmlContent,
    "network_compare.mhtml"
  );

  let mhtmlMonitor = new NetworkMonitor();
  mhtmlMonitor.start();

  let mhtmlTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    Services.io.newFileURI(mhtmlFile).spec,
    false
  );
  await BrowserTestUtils.waitForContentEvent(
    mhtmlTab.linkedBrowser,
    "DOMContentLoaded",
    true
  );
  await new Promise(resolve => setTimeout(resolve, 1000));

  mhtmlMonitor.stop();
  let mhtmlRequests = mhtmlMonitor
    .getRequests()
    .filter(
      req =>
        req.url.startsWith("http://") || req.url.startsWith("https://")
    );

  await BrowserTestUtils.removeTab(mhtmlTab);
  await IOUtils.remove(mhtmlFile.path);

  // Compare: HTML may trigger network requests, MHTML must not
  info(`Regular HTML triggered ${htmlRequests.length} external requests`);
  info(`MHTML triggered ${mhtmlRequests.length} external requests`);

  is(
    mhtmlRequests.length,
    0,
    "MHTML must have ZERO external requests (even if HTML has some)"
  );
});

