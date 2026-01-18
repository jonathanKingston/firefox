/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "archiveStore", () => {
  return Cc["@mozilla.org/mhtml-archive-store;1"].getService(
    Ci.nsIMHTMLArchiveStore
  );
});

/**
 *
 */
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

  #handleRegister({ archiveId, uri, resources, mainDocument: _mainDocument }) {
    try {
      if (uri) {
        lazy.archiveStore.registerURIToArchiveId(uri, archiveId);
      }

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
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  #handleUnregister({ archiveId }) {
    try {
      lazy.archiveStore.unregisterArchive(archiveId);
    } catch {
      // Archive may not exist or already unregistered
    }
  }
}
