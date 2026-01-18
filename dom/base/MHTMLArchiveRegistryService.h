/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_MHTMLArchiveRegistryService_h
#define mozilla_dom_MHTMLArchiveRegistryService_h

#include "mozilla/RefPtr.h"
#include "mozilla/StaticPtr.h"
#include "nsIMHTMLArchive.h"
#include "nsString.h"
#include "nsTHashMap.h"

namespace mozilla::dom {

class MHTMLArchive;

class MHTMLArchiveRegistryService final : public nsIMHTMLArchiveRegistry {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIMHTMLARCHIVEREGISTRY

  static already_AddRefed<MHTMLArchiveRegistryService> GetOrCreate();
  static MHTMLArchive* Lookup(const nsACString& aId);

 private:
  MHTMLArchiveRegistryService() = default;
  ~MHTMLArchiveRegistryService() = default;

  struct Entry {
    RefPtr<MHTMLArchive> mArchive;
    uint64_t mInnerWindowId;
  };

  nsTHashMap<nsCStringHashKey, Entry> mArchives;

  static StaticRefPtr<MHTMLArchiveRegistryService> sSingleton;
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_MHTMLArchiveRegistryService_h
