/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * MHTML Stream Converter
 * 
 * Converts MHTML (multipart/related) streams to HTML for display.
 * This allows Firefox to load .mhtml files via the file:// protocol
 * without hitting sandbox restrictions.
 * 
 * Architecture:
 * 1. File:// protocol handler reads the file (has sandbox permissions)
 * 2. This converter detects MHTML content and processes the stream
 * 3. Outputs HTML stream for browser to display
 */

import { MHTMLParser } from "resource://gre/modules/MHTMLParser.sys.mjs";

const { ComponentUtils } = ChromeUtils.import(
  "resource://gre/modules/ComponentUtils.jsm"
);

export class nsMHTMLConverter {
  classID = Components.ID("{a9e5b8c0-4f1d-4e5e-9c2d-3b4a5c6d7e8f}");
  contractID = "@mozilla.org/streamconv;1?from=multipart/related&to=text/html";
  classDescription = "MHTML to HTML Stream Converter";
  
  QueryInterface = ChromeUtils.generateQI([
    "nsIStreamConverter",
    "nsIStreamListener",
    "nsIRequestObserver",
  ]);

  constructor() {
    this._listener = null;
    this._context = null;
    this._chunks = [];
  }

  /**
   * nsIStreamConverter
   */
  convert(aFromStream, aFromType, aToType, aContext) {
    throw Components.Exception(
      "Synchronous conversion not supported",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  asyncConvertData(aFromType, aToType, aListener, aContext) {
    console.log(`MHTML Converter: asyncConvertData from=${aFromType} to=${aToType}`);
    
    // Store the listener to send converted data to
    this._listener = aListener;
    this._context = aContext;
    this._chunks = [];
    
    return;
  }

  /**
   * nsIStreamListener
   */
  onDataAvailable(aRequest, aInputStream, aOffset, aCount) {
    console.log(`MHTML Converter: onDataAvailable count=${aCount}`);
    
    // Read the incoming MHTML data
    const scriptableStream = Cc[
      "@mozilla.org/scriptableinputstream;1"
    ].createInstance(Ci.nsIScriptableInputStream);
    scriptableStream.init(aInputStream);
    
    const chunk = scriptableStream.read(aCount);
    this._chunks.push(chunk);
  }

  /**
   * nsIRequestObserver
   */
  onStartRequest(aRequest) {
    console.log("MHTML Converter: onStartRequest");
    
    // Notify our listener that we're starting
    if (this._listener) {
      this._listener.onStartRequest(aRequest);
    }
  }

  onStopRequest(aRequest, aStatusCode) {
    console.log(`MHTML Converter: onStopRequest status=${aStatusCode}`);
    
    try {
      // Combine all chunks into full MHTML content
      const mhtmlContent = this._chunks.join("");
      console.log(`MHTML Converter: Total content length=${mhtmlContent.length}`);
      
      // Parse MHTML
      const parser = new MHTMLParser(mhtmlContent);
      const parts = parser.parse();
      console.log(`MHTML Converter: Parsed ${parts.length} parts`);
      
      // Find the main HTML document
      let htmlContent = "";
      const resourceMap = new Map();
      
      for (const part of parts) {
        if (part.contentType.includes("text/html")) {
          // Found the main HTML
          htmlContent = part.body;
          console.log(`MHTML Converter: Found HTML part, length=${htmlContent.length}`);
        } else if (part.contentLocation || part.contentID) {
          // Build resource map for URL rewriting
          const contentType = part.contentType || "application/octet-stream";
          
          // Encode resource as data: URL
          let dataURL = `data:${contentType}`;
          if (part.encoding === "base64" || this._isBinary(part.body)) {
            // Already base64 or binary
            const base64Data = this._toBase64(part.body, part.encoding);
            dataURL += `;base64,${base64Data}`;
          } else {
            // Text content
            dataURL += `,${encodeURIComponent(part.body)}`;
          }
          
          // Map by Content-Location
          if (part.contentLocation) {
            resourceMap.set(part.contentLocation, dataURL);
          }
          
          // Map by cid: URI (Chrome compatibility)
          if (part.contentID) {
            resourceMap.set(`cid:${part.contentID}`, dataURL);
          }
        }
      }
      
      // Rewrite URLs in HTML to point to data: URLs
      htmlContent = this._rewriteURLs(htmlContent, resourceMap);
      
      // Inject CSP for security (block external resources)
      htmlContent = this._injectCSP(htmlContent);
      
      console.log(`MHTML Converter: Final HTML length=${htmlContent.length}`);
      
      // Convert to input stream
      const converter = Cc[
        "@mozilla.org/intl/scriptableunicodeconverter"
      ].createInstance(Ci.nsIScriptableUnicodeConverter);
      converter.charset = "UTF-8";
      
      const htmlStream = converter.convertToInputStream(htmlContent);
      
      // Send converted HTML to listener
      if (this._listener) {
        this._listener.onDataAvailable(
          aRequest,
          htmlStream,
          0,
          htmlContent.length
        );
        this._listener.onStopRequest(aRequest, aStatusCode);
      }
    } catch (e) {
      console.error("MHTML Converter error:", e);
      
      // Send error to listener
      if (this._listener) {
        this._listener.onStopRequest(aRequest, Cr.NS_ERROR_FAILURE);
      }
    }
    
    // Clean up
    this._chunks = [];
    this._listener = null;
    this._context = null;
  }

  /**
   * Helper: Rewrite URLs in HTML
   */
  _rewriteURLs(html, resourceMap) {
    // Rewrite src= and href= attributes
    const attributes = ["src", "href"];
    
    for (const attr of attributes) {
      const regex = new RegExp(
        `${attr}=["']([^"']+)["']`,
        "gi"
      );
      
      html = html.replace(regex, (match, url) => {
        // Skip data:, about:, javascript:, #anchors
        if (
          url.startsWith("data:") ||
          url.startsWith("about:") ||
          url.startsWith("javascript:") ||
          url.startsWith("#")
        ) {
          return match;
        }
        
        // Try exact match
        if (resourceMap.has(url)) {
          return `${attr}="${resourceMap.get(url)}"`;
        }
        
        // Try base URL (without query/fragment)
        const baseURL = url.split(/[?#]/)[0];
        if (resourceMap.has(baseURL)) {
          return `${attr}="${resourceMap.get(baseURL)}"`;
        }
        
        // Try path matching (for relative URLs)
        for (const [resourceURL, dataURL] of resourceMap) {
          if (resourceURL.endsWith(url)) {
            return `${attr}="${dataURL}"`;
          }
        }
        
        // External URL - replace with about:blank for security
        if (url.match(/^https?:\/\//i)) {
          return `${attr}="about:blank"`;
        }
        
        // Keep as-is for relative URLs
        return match;
      });
    }
    
    return html;
  }

  /**
   * Helper: Inject Content Security Policy
   */
  _injectCSP(html) {
    const csp =
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ' +
      'script-src \'unsafe-inline\'; style-src \'unsafe-inline\' data:; ' +
      'img-src data:; font-src data:; connect-src \'none\'; frame-src \'none\';">';
    
    // Try to inject in <head>
    let headEnd = html.indexOf("</head>");
    if (headEnd === -1) {
      headEnd = html.indexOf("<body");
    }
    
    if (headEnd !== -1) {
      return html.slice(0, headEnd) + csp + "\n" + html.slice(headEnd);
    }
    
    // Prepend if no <head> found
    return csp + "\n" + html;
  }

  /**
   * Helper: Check if content is binary
   */
  _isBinary(content) {
    // Simple heuristic: check for null bytes or high percentage of non-printable
    return content.includes("\0") || !/^[\x20-\x7E\s]*$/.test(content.slice(0, 1000));
  }

  /**
   * Helper: Convert to base64
   */
  _toBase64(content, currentEncoding) {
    if (currentEncoding === "base64") {
      // Already base64, clean it up
      return content.replace(/\s/g, "");
    }
    
    // Convert to base64
    try {
      return btoa(content);
    } catch (e) {
      // If btoa fails (non-ASCII), encode as UTF-8 first
      const encoder = new TextEncoder();
      const bytes = encoder.encode(content);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }
  }
}

