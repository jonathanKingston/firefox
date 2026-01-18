/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export class MHTMLArchiveChild extends JSProcessActorChild {
  /**
   * Register an MHTML archive in the parent process for subresource loading.
   * Uses sendAsyncMessage for fire-and-forget registration.
   *
   * @param {string} archiveId - Unique identifier for this archive
   * @param {Array} resources - Array of {contentLocation, contentID, contentType, data}
   * @param {object} mainDocument - Main document {contentType, data}
   */
  registerArchiveSync(archiveId, resources, mainDocument) {
    this.sendAsyncMessage("MHTMLArchive:Register", {
      archiveId,
      resources,
      mainDocument,
    });
  }

  unregisterArchive(archiveId) {
    this.sendAsyncMessage("MHTMLArchive:Unregister", { archiveId });
  }
}
