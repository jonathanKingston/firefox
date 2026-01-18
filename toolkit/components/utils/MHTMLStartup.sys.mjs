/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * MHTML Startup Module
 * Registers MHTML file extensions with the MIME type system
 */

export class MHTMLStartup {
  constructor() {
    this.register();
  }

  register() {
    Services.catMan.addCategoryEntry(
      "ext-to-type-mapping",
      "mhtml",
      "multipart/related",
      false,
      false
    );

    Services.catMan.addCategoryEntry(
      "ext-to-type-mapping",
      "mht",
      "multipart/related",
      false,
      false
    );
  }

  unregister() {
    Services.catMan.deleteCategoryEntry("ext-to-type-mapping", "mhtml", false);
    Services.catMan.deleteCategoryEntry("ext-to-type-mapping", "mht", false);
  }
}
