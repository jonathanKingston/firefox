/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Content-process store for MHTML resources.
 * Used by CID protocol handler to look up resources without IPC.
 */

const gArchives = new Map();

export const MHTMLResourceStore = {
  /**
   * Store resources for an archive.
   * @param {string} archiveId - Archive identifier
   * @param {Array} resources - Array of {contentLocation, contentID, contentType, data}
   */
  addArchive(archiveId, resources) {
    const byURL = new Map();
    const byCID = new Map();

    for (const resource of resources) {
      const dataArray = new Uint8Array(resource.data);

      if (resource.contentLocation) {
        byURL.set(resource.contentLocation, {
          contentType: resource.contentType,
          data: dataArray,
        });
      }

      if (resource.contentID) {
        byCID.set(resource.contentID, {
          contentType: resource.contentType,
          data: dataArray,
        });
      }
    }

    gArchives.set(archiveId, { byURL, byCID });
    console.log(
      `MHTMLResourceStore: Stored archive ${archiveId} with ${byURL.size} URLs and ${byCID.size} CIDs`
    );
  },

  /**
   * Get a resource by URL (Content-Location).
   * @param {string} archiveId - Archive identifier
   * @param {string} url - Content-Location URL
   * @returns {object|null} - {contentType, data} or null
   */
  getByURL(archiveId, url) {
    const archive = gArchives.get(archiveId);
    if (!archive) {
      return null;
    }
    return archive.byURL.get(url) || null;
  },

  /**
   * Get a resource by Content-ID.
   * @param {string} archiveId - Archive identifier
   * @param {string} cid - Content-ID (without angle brackets)
   * @returns {object|null} - {contentType, data} or null
   */
  getByCID(archiveId, cid) {
    const archive = gArchives.get(archiveId);
    if (!archive) {
      return null;
    }
    return archive.byCID.get(cid) || null;
  },

  /**
   * Check if an archive exists.
   * @param {string} archiveId - Archive identifier
   * @returns {boolean}
   */
  hasArchive(archiveId) {
    return gArchives.has(archiveId);
  },

  /**
   * Remove an archive from the store.
   * @param {string} archiveId - Archive identifier
   */
  removeArchive(archiveId) {
    gArchives.delete(archiveId);
  },
};
