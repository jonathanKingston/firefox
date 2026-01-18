/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_MHTMLArchiveStore_h
#define mozilla_dom_MHTMLArchiveStore_h

#include "mozilla/Mutex.h"
#include "mozilla/StaticPtr.h"
#include "nsIMHTMLArchiveStore.h"
#include "nsString.h"
#include "nsTArray.h"
#include "nsTHashMap.h"

namespace mozilla::dom {

struct MHTMLResourceData {
  nsCString mContentType;
  nsTArray<uint8_t> mData;
};

struct MHTMLArchiveData {
  nsTHashMap<nsCStringHashKey, MHTMLResourceData> mResourcesByURL;
  nsTHashMap<nsCStringHashKey, MHTMLResourceData> mResourcesByCID;
};

class MHTMLArchiveStoreService final : public nsIMHTMLArchiveStore {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMHTMLARCHIVESTORE

  MHTMLArchiveStoreService() = default;

  // Static accessors for C++ code (e.g., interceptors)
  static bool GetResource(const nsACString& aArchiveId, const nsACString& aURL,
                          nsACString& aContentType, nsTArray<uint8_t>& aData);

  static bool GetResourceByCID(const nsACString& aArchiveId,
                               const nsACString& aCID, nsACString& aContentType,
                               nsTArray<uint8_t>& aData);

  static bool HasArchive(const nsACString& aArchiveId);

  // URI to archiveId mapping for Document initialization (static C++ API)
  static void SetURIToArchiveIdMapping(const nsACString& aURI,
                                       const nsACString& aArchiveId);
  static bool GetArchiveIdForURI(const nsACString& aURI,
                                   nsACString& aArchiveId);

 private:
  ~MHTMLArchiveStoreService() = default;

  static StaticAutoPtr<nsTHashMap<nsCStringHashKey, MHTMLArchiveData>>
      sArchives;
  static StaticAutoPtr<nsTHashMap<nsCStringHashKey, nsCString>> sURIToArchiveId;
  static StaticMutex sMutex;
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_MHTMLArchiveStore_h
