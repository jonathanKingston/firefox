/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {});

function getCppStore() {
  return Cc["@mozilla.org/dom/mhtml-archive-store;1"]?.getService(
    Ci.nsIMHTMLArchiveStore
  );
}

// Global archive storage in parent process
// Keyed by archiveId -> { resourcesByURL: Map, resourcesByCID: Map, mainDocument }
const gArchives = new Map();

export class MHTMLArchiveParent extends JSProcessActorParent {
  receiveMessage(message) {
    switch (message.name) {
      case "MHTMLArchive:Register":
        return this.#handleRegister(message.data);
      case "MHTMLArchive:Unregister":
        return this.#handleUnregister(message.data);
    }
    return undefined;
  }

  #handleRegister({ archiveId, resources, mainDocument }) {
    const archive = {
      resourcesByURL: new Map(),
      resourcesByCID: new Map(),
      mainDocument,
    };

    const cppStore = getCppStore();

    for (const resource of resources) {
      if (resource.contentLocation) {
        archive.resourcesByURL.set(resource.contentLocation, {
          contentType: resource.contentType,
          data: resource.data,
        });
      }
      if (resource.contentID) {
        archive.resourcesByCID.set(resource.contentID, {
          contentType: resource.contentType,
          data: resource.data,
        });
      }

      if (cppStore) {
        try {
          cppStore.addResource(
            archiveId,
            resource.contentLocation || "",
            resource.contentID || "",
            resource.contentType,
            new Uint8Array(resource.data)
          );
        } catch (e) {
          console.error("Failed to add resource to C++ store:", e);
        }
      }
    }

    if (cppStore) {
      try {
        cppStore.finalizeArchive(archiveId);
      } catch (e) {
        console.error("Failed to finalize archive in C++ store:", e);
      }
    }

    gArchives.set(archiveId, archive);
  }

  #handleUnregister({ archiveId }) {
    gArchives.delete(archiveId);

    const cppStore = getCppStore();
    if (cppStore) {
      try {
        cppStore.unregisterArchive(archiveId);
      } catch (e) {
        console.error("Failed to unregister archive from C++ store:", e);
      }
    }
  }

  /**
   * Static method to look up a resource by URL.
   * Called by the HTTP interceptor (if we implement it in JS).
   */
  static getResource(archiveId, url) {
    const archive = gArchives.get(archiveId);
    if (!archive) {
      return null;
    }
    return archive.resourcesByURL.get(url) || null;
  }

  /**
   * Static method to look up a resource by Content-ID.
   */
  static getResourceByCID(archiveId, cid) {
    const archive = gArchives.get(archiveId);
    if (!archive) {
      return null;
    }
    return archive.resourcesByCID.get(cid) || null;
  }

  /**
   * Check if an archive exists.
   */
  static hasArchive(archiveId) {
    return gArchives.has(archiveId);
  }
}

// Export the static methods for use by interceptors
export const MHTMLArchiveStore = {
  getResource: MHTMLArchiveParent.getResource,
  getResourceByCID: MHTMLArchiveParent.getResourceByCID,
  hasArchive: MHTMLArchiveParent.hasArchive,
};
