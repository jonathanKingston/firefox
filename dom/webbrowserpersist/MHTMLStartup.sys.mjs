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
    console.log("MHTML Startup: Registering MIME type mappings");
    
    const categoryManager = Cc["@mozilla.org/categorymanager;1"]
      .getService(Ci.nsICategoryManager);

    // Register .mhtml extension
    categoryManager.addCategoryEntry(
      "ext-to-type-mapping",
      "mhtml",
      "multipart/related",
      false,
      false
    );
    console.log("MHTML Startup: Registered .mhtml → multipart/related");

    // Register .mht extension
    categoryManager.addCategoryEntry(
      "ext-to-type-mapping",
      "mht",
      "multipart/related",
      false,
      false
    );
    console.log("MHTML Startup: Registered .mht → multipart/related");
    
    // Test that the registration worked
    try {
      const mimeService = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService);
      const testType = mimeService.getTypeFromExtension("mhtml");
      console.log(`MHTML Startup: Verification - getTypeFromExtension("mhtml") = ${testType}`);
    } catch (e) {
      console.error("MHTML Startup: Failed to verify registration:", e);
    }
  }

  unregister() {
    const categoryManager = Cc["@mozilla.org/categorymanager;1"]
      .getService(Ci.nsICategoryManager);

    categoryManager.deleteCategoryEntry(
      "ext-to-type-mapping",
      "mhtml",
      false
    );

    categoryManager.deleteCategoryEntry(
      "ext-to-type-mapping",
      "mht",
      false
    );
  }
}

