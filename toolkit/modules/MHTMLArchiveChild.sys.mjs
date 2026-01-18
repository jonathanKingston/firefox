/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Child-side JSProcessActor for MHTML archive registration.
 */
export class MHTMLArchiveChild extends JSProcessActorChild {
  /**
   * Register an MHTML archive in the parent process for subresource loading.
   * Returns a Promise that resolves when registration is complete.
   *
   * @param {string} archiveId - Unique identifier for the archive.
   * @param {string} uri - URI of the MHTML file.
   * @param {Array} resources - Array of resource objects.
   * @param {object} mainDocument - The main HTML document resource.
   * @returns {Promise} Resolves when registration is complete.
   */
  registerArchive(archiveId, uri, resources, mainDocument) {
    return this.sendQuery("MHTMLArchive:Register", {
      archiveId,
      uri,
      resources,
      mainDocument,
    });
  }

  unregisterArchive(archiveId) {
    this.sendAsyncMessage("MHTMLArchive:Unregister", { archiveId });
  }
}
