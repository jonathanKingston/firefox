/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Parser for MHTML (MIME Encapsulation of Aggregate HTML Documents)
 * Extracts parts from multipart/related MIME format
 */
export class MHTMLParser {
  constructor(mhtmlContent) {
    this.content = mhtmlContent;
    this.boundary = null;
    this.parts = [];
  }

  /**
   * Parse the MHTML content and extract all parts
   *
   * @returns {Array} Array of part objects with {contentType, contentLocation, encoding, headers, body}
   */
  parse() {
    // Extract boundary from Content-Type header
    let boundaryMatch = this.content.match(/boundary="([^"]+)"/i);
    if (!boundaryMatch) {
      boundaryMatch = this.content.match(/boundary=([^\s\r\n;]+)/i);
    }

    if (!boundaryMatch) {
      // Check if this looks like MHTML (has Content-Type header) - if so, it's malformed
      if (this.content.match(/^Content-Type:/im)) {
        throw new Error("No boundary found in MHTML file");
      }
      // Otherwise it's not MHTML, return empty
      return this.parts;
    }

    this.boundary = boundaryMatch[1];

    // Split content by boundary
    let boundaryRegex = new RegExp(
      `--${this._escapeRegex(this.boundary)}`,
      "g"
    );
    let rawParts = this.content.split(boundaryRegex);

    // Process all parts after the preamble
    for (let i = 1; i < rawParts.length; i++) {
      let rawPart = rawParts[i];

      // Skip if this is the final boundary marker (starts with --)
      if (rawPart.trim().startsWith("--")) {
        continue;
      }

      let part = this._parsePart(rawPart);
      if (part) {
        this.parts.push(part);
      }
    }

    return this.parts;
  }

  /**
   * Parse a single MIME part
   *
   * @param {string} rawPart - Raw MIME part content
   * @returns {object | null} Parsed part or null if invalid
   */
  _parsePart(rawPart) {
    // Find the blank line separating headers from body
    let headerEnd = rawPart.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      headerEnd = rawPart.indexOf("\n\n");
      if (headerEnd === -1) {
        return null;
      }
    }

    let headerSection = rawPart.substring(0, headerEnd);
    let body = rawPart.substring(headerEnd).replace(/^(\r?\n)+/, "");

    // Parse headers
    let headers = this._parseHeaders(headerSection);

    let contentType = headers["content-type"] || "text/plain";
    let contentLocation = headers["content-location"] || null;
    let contentID = headers["content-id"] || null;
    let encoding = headers["content-transfer-encoding"] || null;
    let charset = this._extractCharset(contentType);

    // Clean up Content-ID (strip angle brackets per RFC 822)
    if (contentID) {
      contentID = contentID.replace(/^<|>$/g, "");
    }

    // Clean up body (remove trailing boundary markers and whitespace)
    body = body.replace(/\r?\n--[^\r\n]*$/, "").trim();

    return {
      contentType: contentType.split(";")[0].trim(),
      contentLocation,
      contentID,
      encoding,
      charset,
      headers,
      body,
    };
  }

  /**
   * Parse MIME headers into an object
   *
   * @param {string} headerSection - Raw headers section
   * @returns {object} Headers as key-value pairs
   */
  _parseHeaders(headerSection) {
    let headers = {};
    let lines = headerSection.split(/\r?\n/);
    let currentHeader = null;

    for (let line of lines) {
      // Check if this is a continuation line (starts with whitespace)
      if (line.match(/^\s/) && currentHeader) {
        headers[currentHeader] += " " + line.trim();
      } else {
        // New header
        let colonIndex = line.indexOf(":");
        if (colonIndex > 0) {
          let name = line.substring(0, colonIndex).trim().toLowerCase();
          let value = line.substring(colonIndex + 1).trim();
          headers[name] = value;
          currentHeader = name;
        }
      }
    }

    return headers;
  }

  /**
   * Extract charset from Content-Type header
   *
   * @param {string} contentType - Content-Type header value
   * @returns {string|null} Charset or null
   */
  _extractCharset(contentType) {
    let charsetMatch = contentType.match(/charset=["']?([^"';]+)["']?/i);
    return charsetMatch ? charsetMatch[1] : null;
  }

  /**
   * Escape special regex characters
   *
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Get a specific part by Content-Location
   *
   * @param {string} location - Content-Location URL
   * @returns {object | null} Part object or null if not found
   */
  getPartByLocation(location) {
    return this.parts.find(p => p.contentLocation === location);
  }

  /**
   * Get a specific part by Content-ID
   *
   * @param {string} cid - Content-ID (with or without angle brackets)
   * @returns {object | null} Part object or null if not found
   */
  getPartByCID(cid) {
    // Strip angle brackets if present
    let cleanCID = cid.replace(/^<|>$/g, "");
    return this.parts.find(p => p.contentID === cleanCID);
  }

  /**
   * Get the main HTML document (first text/html part)
   *
   * @returns {object | null} HTML part or null if not found
   */
  getMainDocument() {
    return this.parts.find(p => p.contentType.includes("text/html"));
  }

  /**
   * Decode a part's body based on its encoding
   *
   * @param {object} part - Part object
   * @returns {string} Decoded body
   */
  decodeBody(part) {
    if (
      !part.encoding ||
      part.encoding.toLowerCase() === "7bit" ||
      part.encoding.toLowerCase() === "8bit"
    ) {
      return part.body;
    }

    if (part.encoding.toLowerCase() === "base64") {
      try {
        return atob(part.body.replace(/\s/g, ""));
      } catch (ex) {
        console.error("Failed to decode base64:", ex);
        return part.body;
      }
    }

    if (part.encoding.toLowerCase() === "quoted-printable") {
      return this._decodeQuotedPrintable(part.body);
    }

    return part.body;
  }

  /**
   * Decode quoted-printable encoding
   *
   * @param {string} str - Quoted-printable encoded string
   * @returns {string} Decoded string
   */
  _decodeQuotedPrintable(str) {
    // First remove soft line breaks
    str = str.replace(/=\r?\n/g, "");

    // Replace =XX hex codes with bytes
    const bytes = [];
    let i = 0;
    while (i < str.length) {
      if (str[i] === "=") {
        if (i + 2 < str.length) {
          const hex = str.substring(i + 1, i + 3);
          if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
            bytes.push(parseInt(hex, 16));
            i += 3;
            continue;
          }
        }
        // Invalid QP sequence - skip the '=' and continue
        // (RFC 2045 says decoder should be lenient)
        i++;
        continue;
      }
      bytes.push(str.charCodeAt(i));
      i++;
    }

    // Decode as UTF-8
    try {
      const decoder = new TextDecoder("utf-8");
      return decoder.decode(new Uint8Array(bytes));
    } catch (e) {
      // Fallback to Latin-1 if UTF-8 fails
      return String.fromCharCode(...bytes);
    }
  }

  /**
   * Decode a part's body as raw bytes (for binary content like images)
   *
   * @param {object} part - Part object
   * @returns {Array<number>} Array of byte values
   */
  decodeBodyAsBytes(part) {
    if (part.encoding?.toLowerCase() === "base64") {
      try {
        const binary = atob(part.body.replace(/\s/g, ""));
        const bytes = new Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
      } catch (ex) {
        console.error("Failed to decode base64:", ex);
        // Fall through to return raw body as bytes
      }
    }

    if (part.encoding?.toLowerCase() === "quoted-printable") {
      return this._decodeQuotedPrintableAsBytes(part.body);
    }

    // For 7bit/8bit or no encoding, convert string to bytes
    const bytes = new Array(part.body.length);
    for (let i = 0; i < part.body.length; i++) {
      bytes[i] = part.body.charCodeAt(i) & 0xff;
    }
    return bytes;
  }

  /**
   * Decode quoted-printable encoding as raw bytes
   *
   * @param {string} str - Quoted-printable encoded string
   * @returns {Array<number>} Array of byte values
   */
  _decodeQuotedPrintableAsBytes(str) {
    str = str.replace(/=\r?\n/g, "");

    const bytes = [];
    let i = 0;
    while (i < str.length) {
      if (str[i] === "=") {
        if (i + 2 < str.length) {
          const hex = str.substring(i + 1, i + 3);
          if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
            bytes.push(parseInt(hex, 16));
            i += 3;
            continue;
          }
        }
        // Invalid QP sequence - skip the '=' and continue
        i++;
        continue;
      }
      bytes.push(str.charCodeAt(i) & 0xff);
      i++;
    }
    return bytes;
  }
}
