/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  MHTMLParser: "resource://gre/modules/MHTMLParser.sys.mjs",
});

/**
 * MHTMLArchive represents a parsed MHTML document with its embedded resources.
 * Similar to Chrome's MHTMLArchive class.
 *
 * Usage:
 *   let archive = MHTMLArchive.create(mhtmlContent, baseURI);
 *   let mainHTML = archive.getMainDocument();
 *   let resource = archive.getResource(uri);
 */
export class MHTMLArchive {
  /**
   * Create an archive from MHTML content
   *
   * @param {string} mhtmlContent - Raw MHTML file content
   * @param {nsIURI} baseURI - Base URI for the archive (usually file:// URI)
   * @returns {MHTMLArchive} Archive instance
   */
  static create(mhtmlContent, baseURI) {
    return new MHTMLArchive(mhtmlContent, baseURI);
  }

  /**
   * Check if content appears to be MHTML
   *
   * @param {string} content - Content to check
   * @returns {boolean} True if appears to be MHTML
   */
  static isMHTML(content) {
    // Check for MHTML signatures
    return (
      content.includes("MIME-Version:") &&
      content.includes("Content-Type:") &&
      (content.includes("multipart/related") ||
        content.includes("message/rfc822")) &&
      content.includes("boundary=")
    );
  }

  constructor(mhtmlContent, baseURI) {
    this.baseURI = baseURI;
    this.parser = new lazy.MHTMLParser(mhtmlContent);
    this.parts = [];
    this.resourceMap = new Map(); // URL -> resource part
    this.mainDocument = null;

    try {
      this.parts = this.parser.parse();
      this._buildResourceMap();
    } catch (ex) {
      console.error("Failed to parse MHTML archive:", ex);
      throw ex;
    }
  }

  /**
   * Build a map of URLs to resources for quick lookup
   *
   * @private
   */
  _buildResourceMap() {
    for (let part of this.parts) {
      // Main HTML document
      if (!this.mainDocument && part.contentType.includes("text/html")) {
        this.mainDocument = part;
        if (part.contentLocation) {
          this.resourceMap.set(part.contentLocation, part);
        }
      }

      // All resources with Content-Location
      if (part.contentLocation) {
        this.resourceMap.set(part.contentLocation, part);

        // Also map without protocol/host for relative URL matching
        try {
          let uri = Services.io.newURI(part.contentLocation);
          let pathOnly = uri.pathQueryRef;
          if (pathOnly && !this.resourceMap.has(pathOnly)) {
            this.resourceMap.set(pathOnly, part);
          }
        } catch (ex) {
          // Invalid URI, skip
        }
      }
    }
  }

  /**
   * Get the main HTML document
   *
   * @returns {object | null} Main document part or null
   */
  getMainDocument() {
    return this.mainDocument;
  }

  /**
   * Get a resource by URI
   *
   * @param {nsIURI|string} uri - URI of the resource
   * @returns {object | null} Resource part or null if not found
   */
  getResource(uri) {
    let uriString = typeof uri === "string" ? uri : uri.spec;

    // Try exact match
    if (this.resourceMap.has(uriString)) {
      return this.resourceMap.get(uriString);
    }

    // Try without protocol/host
    try {
      let parsedURI = Services.io.newURI(uriString);
      let pathOnly = parsedURI.pathQueryRef;
      if (this.resourceMap.has(pathOnly)) {
        return this.resourceMap.get(pathOnly);
      }
    } catch (ex) {
      // Invalid URI
    }

    // Try relative to base
    if (this.baseURI) {
      try {
        let resolved = Services.io.newURI(uriString, null, this.baseURI);
        if (this.resourceMap.has(resolved.spec)) {
          return this.resourceMap.get(resolved.spec);
        }
      } catch (ex) {
        // Can't resolve
      }
    }

    return null;
  }

  /**
   * Get resource as decoded data
   *
   * @param {nsIURI|string} uri - URI of the resource
   * @returns {Uint8Array|null} Decoded resource data or null
   */
  getResourceData(uri) {
    let resource = this.getResource(uri);
    if (!resource) {
      return null;
    }

    let decoded = this.parser.decodeBody(resource);

    // Convert to bytes
    if (resource.encoding === "base64") {
      // Already decoded as string, convert back to bytes
      let binary = "";
      for (let i = 0; i < decoded.length; i++) {
        binary += String.fromCharCode(decoded.charCodeAt(i) & 0xff);
      }
      return new TextEncoder().encode(binary);
    }
    // Text content
    return new TextEncoder().encode(decoded);
  }

  /**
   * Check if archive has a specific resource
   *
   * @param {nsIURI|string} uri - URI to check
   * @returns {boolean} True if resource exists
   */
  hasResource(uri) {
    return this.getResource(uri) !== null;
  }

  /**
   * Get all resource URLs in the archive
   *
   * @returns {Array<string>} Array of resource URLs
   */
  getResourceURLs() {
    return Array.from(this.resourceMap.keys());
  }

  /**
   * Get archive statistics
   *
   * @returns {object} Stats object with counts
   */
  getStats() {
    let stats = {
      totalParts: this.parts.length,
      resources: this.resourceMap.size,
      byType: {},
    };

    for (let part of this.parts) {
      let type = part.contentType.split("/")[0];
      stats.byType[type] = (stats.byType[type] || 0) + 1;
    }

    return stats;
  }
}
