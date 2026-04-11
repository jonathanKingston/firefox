"use strict";

const contentBase =
  "https://example.com/browser/toolkit/components/windowcreator/test/";

/**
 * Helper to save a page as MHTML and return the file
 *
 * @param {string} name
 * @param {string} uri
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
 *
 * @param {nsIFile} file
 */
async function readMHTML(file) {
  return IOUtils.readUTF8(file.path);
}

function parseMHTMLHeaders(headerText) {
  let headers = new Map();
  let currentHeader = null;

  for (let line of headerText.split("\r\n")) {
    if (!line) {
      continue;
    }

    if (/^[ \t]/.test(line) && currentHeader) {
      headers.set(currentHeader, headers.get(currentHeader) + line.trim());
      continue;
    }

    let separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }

    currentHeader = line.slice(0, separator).trim().toLowerCase();
    headers.set(currentHeader, line.slice(separator + 1).trim());
  }

  return headers;
}

function decodeMHTMLBody(body, transferEncoding) {
  if (transferEncoding !== "base64") {
    return body;
  }

  let normalized = body.replace(/\s+/g, "");
  let binary = atob(normalized);
  let bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function parseMHTML(content) {
  let boundaryMatch = content.match(/boundary="([^"]+)"/);
  ok(boundaryMatch, "MHTML should contain a boundary");
  let boundary = boundaryMatch?.[1];

  let rawParts = content.split("--" + boundary);
  let parts = [];

  for (let rawPart of rawParts.slice(1)) {
    if (!rawPart || rawPart.startsWith("--")) {
      continue;
    }

    let part = rawPart.startsWith("\r\n") ? rawPart.slice(2) : rawPart;
    let splitAt = part.indexOf("\r\n\r\n");
    if (splitAt === -1) {
      continue;
    }

    let headerText = part.slice(0, splitAt);
    let body = part.slice(splitAt + 4).replace(/\r\n$/, "");
    let headers = parseMHTMLHeaders(headerText);
    let transferEncoding =
      headers.get("content-transfer-encoding")?.toLowerCase() ?? "";
    let decodedBody = decodeMHTMLBody(body, transferEncoding);

    parts.push({
      headers,
      body,
      decodedBody,
    });
  }

  return { boundary, parts };
}

function findPartByContentLocation(parts, locationSubstring) {
  return parts.find(part =>
    (part.headers.get("content-location") || "").includes(locationSubstring)
  );
}

add_task(async function test_mhtml_basic() {
  info("Testing basic MHTML save functionality");

  let uri = contentBase + "file_persist_simple.html";
  let mhtmlFile = await saveAsMHTML("basic_test", uri);

  ok(mhtmlFile.exists(), "MHTML file should exist");
  Assert.greater(mhtmlFile.fileSize, 0, "MHTML file should not be empty");

  let content = await readMHTML(mhtmlFile);
  let { parts } = parseMHTML(content);

  // Check top-level MHTML envelope headers.
  ok(content.includes("MIME-Version: 1.0"), "Should have MIME-Version header");
  ok(
    content.includes("Content-Type: multipart/related"),
    "Should be multipart/related"
  );
  ok(content.includes("boundary="), "Should have boundary");
  ok(content.includes("From: <Saved by Gecko>"), "Should have From header");
  ok(
    content.includes("Snapshot-Content-Location:"),
    "Should have Snapshot-Content-Location header"
  );
  ok(
    /Date: .+ GMT\r\n/.test(content),
    "Date header should be in UTC (GMT suffix)"
  );
  ok(
    content.includes("This is a multi-part message in MIME format."),
    "Should have MIME prologue before first boundary"
  );

  // Check HTML part uses correct Content-Transfer-Encoding.
  ok(
    content.includes("Content-Transfer-Encoding: 7bit"),
    "ASCII HTML part should use 7bit CTE"
  );

  // Check HTML content.
  ok(content.includes("text/html"), "Should contain HTML content");
  ok(content.includes("MHTML Test Page"), "Should contain page title");
  ok(parts.length >= 2, "Should include HTML and at least one resource part");

  // Check scripts are stripped.
  ok(!content.includes("<script"), "Should not contain script tags");
  ok(!content.includes("<noscript"), "Should not contain noscript tags");
  ok(!content.includes("console.log"), "Should not contain script content");

  // Check resources are embedded.
  ok(
    content.includes("Content-Transfer-Encoding: base64"),
    "Should have base64 encoded resources"
  );

  info(`MHTML file size: ${mhtmlFile.fileSize} bytes`);
});

add_task(async function test_mhtml_structure() {
  info("Testing deterministic MHTML structure");

  let uri = contentBase + "file_persist_simple.html";
  let mhtmlFile = await saveAsMHTML("structure_test", uri);
  let content = await readMHTML(mhtmlFile);

  // Extract the boundary from the envelope header.
  let boundaryMatch = content.match(/boundary="(----gecko_mhtml_[0-9a-f]+)"/);
  ok(boundaryMatch, "Boundary should match ----gecko_mhtml_<hex> pattern");
  let boundary = boundaryMatch[1];

  // Split on the boundary to get MIME parts.  The first element is the
  // envelope + prologue; the last includes the closing "--" delimiter.
  let parts = content.split("--" + boundary);

  Assert.greaterOrEqual(
    parts.length,
    3,
    "Should have at least envelope, one part, and a closing delimiter"
  );

  // Envelope (before first boundary).
  let envelope = parts[0];
  ok(
    envelope.startsWith("From: <Saved by Gecko>"),
    "Envelope starts with From"
  );
  ok(
    envelope.includes("This is a multi-part message in MIME format."),
    "Envelope contains prologue text"
  );

  // First MIME part should be the HTML document.
  let htmlPart = parts[1];
  ok(
    htmlPart.includes("Content-Type: text/html"),
    "First part is the HTML document"
  );
  ok(
    htmlPart.includes("Content-Transfer-Encoding: 7bit"),
    "HTML part uses 7bit CTE"
  );
  ok(htmlPart.includes("Content-Location:"), "HTML part has Content-Location");

  // Closing boundary.
  let lastPart = parts[parts.length - 1];
  ok(lastPart.startsWith("--"), "Archive ends with closing delimiter");
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

add_task(async function test_mhtml_unicode_decoding() {
  info("Testing UTF-8 content decoding from MHTML parts");

  let uri = contentBase + "file_persist_unicode.html";
  let mhtmlFile = await saveAsMHTML("unicode_test", uri);
  let content = await readMHTML(mhtmlFile);
  let { parts } = parseMHTML(content);

  ok(
    parts.some(part => part.decodedBody.includes("Unicode ✓ café 🚀")),
    "Decoded MHTML content should preserve UTF-8 characters"
  );
});

add_task(async function test_mhtml_iframe_content_preserved() {
  info("Testing iframe and subframe content preservation");

  let uri = contentBase + "file_persist_iframe.html";
  let mhtmlFile = await saveAsMHTML("iframe_test", uri);
  let content = await readMHTML(mhtmlFile);
  let { parts } = parseMHTML(content);

  let mainPart = findPartByContentLocation(parts, "file_persist_iframe.html");
  ok(mainPart, "Main frame part should be present");
  ok(
    mainPart?.decodedBody.includes("Main Frame"),
    "Main frame content should be present in decoded part"
  );

  let subframePart = findPartByContentLocation(
    parts,
    "file_persist_subframe.html"
  );
  ok(subframePart, "Subframe part should be present");
  ok(
    subframePart?.decodedBody.includes("Subframe Content ✓"),
    "Subframe content should be present in decoded part"
  );
});

add_task(async function test_mhtml_embeds_nested_css_image_resources() {
  info("Testing nested CSS background-image resource embedding");

  let uri = contentBase + "file_persist_css_bg.html";
  let mhtmlFile = await saveAsMHTML("css_bg_test", uri);
  let content = await readMHTML(mhtmlFile);
  let { parts } = parseMHTML(content);

  ok(
    findPartByContentLocation(parts, "file_persist_bg.css"),
    "Linked stylesheet should be embedded"
  );
  ok(
    findPartByContentLocation(parts, "file_persist_image.png"),
    "Nested CSS background image should be embedded"
  );
});

add_task(async function test_mhtml_embeds_nested_css_font_resources() {
  info("Testing nested CSS @font-face resource embedding");

  let uri = contentBase + "file_persist_font.html";
  let mhtmlFile = await saveAsMHTML("css_font_test", uri);
  let content = await readMHTML(mhtmlFile);
  let { parts } = parseMHTML(content);

  ok(
    findPartByContentLocation(parts, "file_persist_font.css"),
    "Font stylesheet should be embedded"
  );
  ok(
    findPartByContentLocation(parts, "file_persist_font.woff2"),
    "Nested @font-face font resource should be embedded"
  );
});
