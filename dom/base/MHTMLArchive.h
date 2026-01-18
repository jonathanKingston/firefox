/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_MHTMLArchive_h
#define mozilla_dom_MHTMLArchive_h

#include "nsIMHTMLArchive.h"
#include "nsString.h"
#include "nsTArray.h"
#include "nsTHashMap.h"

namespace mozilla::dom {

class MHTMLArchive final : public nsIMHTMLArchive {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIMHTMLARCHIVE

  static already_AddRefed<MHTMLArchive> Create();

  nsresult GetResource(const nsACString& aURL, nsACString& aContentType,
                       nsTArray<uint8_t>& aData) const;
  nsresult GetResourceByCID(const nsACString& aCID, nsACString& aContentType,
                            nsTArray<uint8_t>& aData) const;
  nsresult GetMainDocument(nsACString& aHTML) const;

 private:
  struct Resource {
    nsCString mContentType;
    nsTArray<uint8_t> mData;
  };

  MHTMLArchive() = default;
  ~MHTMLArchive() = default;

  const Resource* LookupResource(const nsACString& aURL) const;

  nsTHashMap<nsCStringHashKey, Resource> mResourcesByURL;
  nsTHashMap<nsCStringHashKey, Resource> mResourcesByCID;
  Resource mMainHTML;
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_MHTMLArchive_h
