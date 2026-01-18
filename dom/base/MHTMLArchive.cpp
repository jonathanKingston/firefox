/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MHTMLArchive.h"

namespace mozilla::dom {

NS_IMPL_ISUPPORTS(MHTMLArchive, nsIMHTMLArchive)

/* static */
already_AddRefed<MHTMLArchive> MHTMLArchive::Create() {
  RefPtr<MHTMLArchive> archive = new MHTMLArchive();
  return archive.forget();
}

NS_IMETHODIMP
MHTMLArchive::AddResource(const nsACString& aContentLocation,
                          const nsACString& aContentID,
                          const nsACString& aContentType,
                          const nsTArray<uint8_t>& aData) {
  if (!aContentLocation.IsEmpty()) {
    Resource resource;
    resource.mContentType = aContentType;
    resource.mData = aData.Clone();
    mResourcesByURL.InsertOrUpdate(aContentLocation, std::move(resource));
  }
  if (!aContentID.IsEmpty()) {
    Resource resource;
    resource.mContentType = aContentType;
    resource.mData = aData.Clone();
    mResourcesByCID.InsertOrUpdate(aContentID, std::move(resource));
  }
  return NS_OK;
}

NS_IMETHODIMP
MHTMLArchive::SetMainHTML(const nsTArray<uint8_t>& aData,
                          const nsACString& aContentType) {
  mMainHTML.mData = aData.Clone();
  mMainHTML.mContentType = aContentType;
  return NS_OK;
}

NS_IMETHODIMP
MHTMLArchive::HasResource(const nsACString& aURL, bool* aResult) {
  *aResult = LookupResource(aURL) != nullptr;
  return NS_OK;
}

NS_IMETHODIMP
MHTMLArchive::HasResourceByCID(const nsACString& aCID, bool* aResult) {
  *aResult = mResourcesByCID.Contains(aCID);
  return NS_OK;
}

const MHTMLArchive::Resource* MHTMLArchive::LookupResource(
    const nsACString& aURL) const {
  const Resource* resource = mResourcesByURL.Lookup(aURL).DataPtrOrNull();
  if (resource) {
    return resource;
  }

  nsAutoCString baseURL(aURL);
  int32_t queryPos = baseURL.FindChar('?');
  if (queryPos != kNotFound) {
    baseURL.Truncate(queryPos);
    resource = mResourcesByURL.Lookup(baseURL).DataPtrOrNull();
    if (resource) {
      return resource;
    }
  }

  int32_t hashPos = baseURL.FindChar('#');
  if (hashPos != kNotFound) {
    baseURL.Truncate(hashPos);
    resource = mResourcesByURL.Lookup(baseURL).DataPtrOrNull();
    if (resource) {
      return resource;
    }
  }

  for (const auto& entry : mResourcesByURL) {
    const nsACString& key = entry.GetKey();
    if (StringEndsWith(key, aURL)) {
      // Ensure we're matching at a path boundary (/ or start)
      size_t matchStart = key.Length() - aURL.Length();
      if (matchStart == 0 || key[matchStart - 1] == '/') {
        return &entry.GetData();
      }
    }
  }

  return nullptr;
}

nsresult MHTMLArchive::GetResource(const nsACString& aURL,
                                   nsACString& aContentType,
                                   nsTArray<uint8_t>& aData) const {
  const Resource* resource = LookupResource(aURL);
  if (!resource) {
    return NS_ERROR_FILE_NOT_FOUND;
  }
  aContentType = resource->mContentType;
  aData = resource->mData.Clone();
  return NS_OK;
}

nsresult MHTMLArchive::GetResourceByCID(const nsACString& aCID,
                                        nsACString& aContentType,
                                        nsTArray<uint8_t>& aData) const {
  const Resource* resource = mResourcesByCID.Lookup(aCID).DataPtrOrNull();
  if (!resource) {
    return NS_ERROR_FILE_NOT_FOUND;
  }
  aContentType = resource->mContentType;
  aData = resource->mData.Clone();
  return NS_OK;
}

nsresult MHTMLArchive::GetMainDocument(nsACString& aHTML) const {
  if (mMainHTML.mData.IsEmpty()) {
    return NS_ERROR_NOT_AVAILABLE;
  }
  aHTML.Assign(reinterpret_cast<const char*>(mMainHTML.mData.Elements()),
               mMainHTML.mData.Length());
  return NS_OK;
}

}  // namespace mozilla::dom
