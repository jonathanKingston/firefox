/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * MHTML Document Loader Factory
 *
 * Registers as a Gecko-Content-Viewer for multipart/related to allow
 * Firefox to display MHTML files inline instead of downloading.
 *
 * Architecture:
 * 1. Intercepts multipart/related content
 * 2. Parses MHTML and extracts resources
 * 3. Stores resources in content-process C++ store for cid: URLs
 * 4. Sends archive data to parent process for http(s) URL interception
 * 5. Sets mhtmlArchiveId on loadInfo for subresource propagation
 */

import { MHTMLParser } from "resource://gre/modules/MHTMLParser.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  NetUtil: "resource://gre/modules/NetUtil.sys.mjs",
});

// Content-process MHTML archive store (C++ service)
ChromeUtils.defineLazyGetter(lazy, "archiveStore", () => {
  return Cc["@mozilla.org/mhtml-archive-store;1"].getService(
    Ci.nsIMHTMLArchiveStore
  );
});

function generateUUID() {
  return Services.uuid.generateUUID().toString();
}

export function MHTMLDocumentLoader() {}

MHTMLDocumentLoader.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIDocumentLoaderFactory"]),

  createInstance(
    aCommand,
    aChannel,
    aLoadGroup,
    aContentType,
    aContainer,
    aExtraInfo,
    aDocListenerResult
  ) {
    if (!Services.prefs.getBoolPref("dom.mhtml.read.enabled", true)) {
      throw Components.Exception("", Cr.NS_ERROR_FAILURE);
    }

    aChannel.contentType = "text/html";

    // Pre-generate archiveId and set on loadInfo BEFORE creating the document
    // This allows Document::StartDocumentLoad to pick it up
    const archiveId = generateUUID();
    const loadInfo = aChannel.loadInfo;
    if (loadInfo) {
      loadInfo.mhtmlArchiveId = archiveId;
    }

    const factory = Cc[
      "@mozilla.org/content/document-loader-factory;1"
    ].getService(Ci.nsIDocumentLoaderFactory);

    const listener = {};
    const res = factory.createInstance(
      "view",
      aChannel,
      aLoadGroup,
      "text/html",
      aContainer,
      aExtraInfo,
      listener
    );

    aDocListenerResult.value = new MHTMLStreamListener(
      listener.value,
      aChannel,
      aContainer,
      archiveId
    );

    return res;
  },
};

class MHTMLStreamListener {
  constructor(listener, channel, container, archiveId) {
    this._listener = listener;
    this._channel = channel;
    this._container = container;
    this._archiveId = archiveId;
    this._chunks = [];
    this._decoder = new TextDecoder();
  }

  QueryInterface = ChromeUtils.generateQI([
    "nsIStreamListener",
    "nsIRequestObserver",
  ]);

  onStartRequest(_request) {
    this._chunks = [];
  }

  onDataAvailable(_request, inputStream, _offset, count) {
    const bytes = lazy.NetUtil.readInputStream(inputStream, count);
    this._chunks.push(this._decoder.decode(bytes, { stream: true }));
  }

  onStopRequest(request, statusCode) {
    try {
      if (!Components.isSuccessCode(statusCode)) {
        this._listener.onStartRequest(request);
        this._listener.onStopRequest(request, statusCode);
        return;
      }

      this._chunks.push(this._decoder.decode());
      const mhtmlContent = this._chunks.join("");

      // Parse MHTML and prepare resources
      const { htmlContent, resources, mainDocument, uri } =
        this._parseMHTML(mhtmlContent);

      if (!htmlContent) {
        this._deliverHTML(request, mhtmlContent);
        return;
      }

      // Store resources in content-process C++ store for cid: URL lookups
      // This must happen BEFORE delivering HTML to ensure resources are available
      this._storeResourcesLocally(this._archiveId, resources);

      // Also register in parent process for http(s) URL interception
      const actor = ChromeUtils.domProcessChild.getActor("MHTMLArchive");
      actor
        .registerArchive(this._archiveId, uri, resources, mainDocument)
        .catch(() => {});

      // Deliver HTML - resources are already stored locally for cid: URLs
      this._deliverHTML(request, htmlContent);
    } catch {
      this._listener.onStartRequest(request);
      this._listener.onStopRequest(request, Cr.NS_ERROR_FAILURE);
    }
  }

  _storeResourcesLocally(archiveId, resources) {
    for (const resource of resources) {
      lazy.archiveStore.addResource(
        archiveId,
        resource.contentLocation || "",
        resource.contentID || "",
        resource.contentType,
        resource.data
      );
    }
    lazy.archiveStore.finalizeArchive(archiveId);
  }

  _deliverHTML(request, htmlContent) {
    try {
      const encoder = new TextEncoder();
      const htmlBytes = encoder.encode(htmlContent);

      const stream = Cc[
        "@mozilla.org/io/arraybuffer-input-stream;1"
      ].createInstance(Ci.nsIArrayBufferInputStream);
      stream.setData(htmlBytes.buffer, 0, htmlBytes.length);

      this._listener.onStartRequest(request);
      this._listener.onDataAvailable(request, stream, 0, htmlBytes.length);
      this._listener.onStopRequest(request, Cr.NS_OK);
    } catch {
      this._listener.onStartRequest(request);
      this._listener.onStopRequest(request, Cr.NS_ERROR_FAILURE);
    }
  }

  _parseMHTML(mhtmlContent) {
    const parser = new MHTMLParser();
    parser.content = mhtmlContent;
    const parts = parser.parse();

    if (!parts || parts.length === 0) {
      return { htmlContent: null, resources: [], mainDocument: null, uri: "" };
    }

    const resources = [];
    let htmlContent = null;
    let mainDocument = null;

    for (const part of parts) {
      const decodedBody = parser.decodeBody(part);

      let data;
      if (
        part.contentType.startsWith("image/") ||
        part.contentType.startsWith("application/")
      ) {
        data = parser.decodeBodyAsBytes(part);
      } else {
        const encoder = new TextEncoder();
        data = Array.from(encoder.encode(decodedBody));
      }

      const resource = {
        contentLocation: part.contentLocation || "",
        contentID: part.contentID || "",
        contentType: part.contentType,
        data,
      };

      resources.push(resource);

      if (htmlContent === null && part.contentType.includes("text/html")) {
        htmlContent = decodedBody;
        mainDocument = resource;
      }
    }

    let uri = "";
    try {
      uri = this._channel.URI.spec;
    } catch {
      // Ignore - URI not available
    }

    return { htmlContent, resources, mainDocument, uri };
  }
}
