/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MHTMLArchiveStore.h"

namespace mozilla::dom {

NS_IMPL_ISUPPORTS(MHTMLArchiveStoreService, nsIMHTMLArchiveStore)

StaticAutoPtr<nsTHashMap<nsCStringHashKey, MHTMLArchiveData>>
    MHTMLArchiveStoreService::sArchives;
StaticAutoPtr<nsTHashMap<nsCStringHashKey, nsCString>>
    MHTMLArchiveStoreService::sURIToArchiveId;
StaticMutex MHTMLArchiveStoreService::sMutex MOZ_UNANNOTATED;

NS_IMETHODIMP
MHTMLArchiveStoreService::AddResource(const nsACString& aArchiveId,
                                      const nsACString& aContentLocation,
                                      const nsACString& aContentID,
                                      const nsACString& aContentType,
                                      const nsTArray<uint8_t>& aData) {
  StaticMutexAutoLock lock(sMutex);

  if (!sArchives) {
    sArchives = new nsTHashMap<nsCStringHashKey, MHTMLArchiveData>();
  }

  // Get or create archive
  if (!sArchives->Contains(aArchiveId)) {
    sArchives->InsertOrUpdate(nsCString(aArchiveId), MHTMLArchiveData());
  }
  MHTMLArchiveData* archive = sArchives->Lookup(aArchiveId).DataPtrOrNull();

  MHTMLResourceData resourceData;
  resourceData.mContentType = aContentType;
  resourceData.mData.AppendElements(aData);

  if (!aContentLocation.IsEmpty()) {
    MHTMLResourceData copy;
    copy.mContentType = resourceData.mContentType;
    copy.mData.AppendElements(resourceData.mData);
    archive->mResourcesByURL.InsertOrUpdate(nsCString(aContentLocation),
                                            std::move(copy));
  }

  if (!aContentID.IsEmpty()) {
    archive->mResourcesByCID.InsertOrUpdate(nsCString(aContentID),
                                            std::move(resourceData));
  }

  return NS_OK;
}

NS_IMETHODIMP
MHTMLArchiveStoreService::FinalizeArchive(const nsACString& aArchiveId) {
  // Currently a no-op, but could be used for validation or optimization
  return NS_OK;
}

NS_IMETHODIMP
MHTMLArchiveStoreService::UnregisterArchive(const nsACString& aArchiveId) {
  StaticMutexAutoLock lock(sMutex);

  if (sArchives) {
    sArchives->Remove(aArchiveId);
  }
  return NS_OK;
}

NS_IMETHODIMP
MHTMLArchiveStoreService::GetResource(const nsACString& aArchiveId,
                                      const nsACString& aURL,
                                      nsACString& aContentType,
                                      nsTArray<uint8_t>& aData, bool* aResult) {
  *aResult = GetResource(aArchiveId, aURL, aContentType, aData);
  return NS_OK;
}

NS_IMETHODIMP
MHTMLArchiveStoreService::GetResourceByCID(const nsACString& aArchiveId,
                                           const nsACString& aCID,
                                           nsACString& aContentType,
                                           nsTArray<uint8_t>& aData,
                                           bool* aResult) {
  *aResult = GetResourceByCID(aArchiveId, aCID, aContentType, aData);
  return NS_OK;
}

NS_IMETHODIMP
MHTMLArchiveStoreService::HasArchive(const nsACString& aArchiveId,
                                     bool* aResult) {
  *aResult = HasArchive(aArchiveId);
  return NS_OK;
}

NS_IMETHODIMP
MHTMLArchiveStoreService::RegisterURIToArchiveId(const nsACString& aURI,
                                                 const nsACString& aArchiveId) {
  SetURIToArchiveIdMapping(aURI, aArchiveId);
  return NS_OK;
}

// Static methods for C++ direct access
bool MHTMLArchiveStoreService::GetResource(const nsACString& aArchiveId,
                                           const nsACString& aURL,
                                           nsACString& aContentType,
                                           nsTArray<uint8_t>& aData) {
  StaticMutexAutoLock lock(sMutex);

  if (!sArchives) {
    return false;
  }

  auto archiveEntry = sArchives->Lookup(aArchiveId);
  if (!archiveEntry) {
    return false;
  }

  auto resourceEntry = archiveEntry->mResourcesByURL.Lookup(aURL);
  if (!resourceEntry) {
    return false;
  }

  aContentType.Assign(resourceEntry->mContentType);
  aData.AppendElements(resourceEntry->mData);
  return true;
}

bool MHTMLArchiveStoreService::GetResourceByCID(const nsACString& aArchiveId,
                                                const nsACString& aCID,
                                                nsACString& aContentType,
                                                nsTArray<uint8_t>& aData) {
  StaticMutexAutoLock lock(sMutex);

  if (!sArchives) {
    return false;
  }

  auto archiveEntry = sArchives->Lookup(aArchiveId);
  if (!archiveEntry) {
    return false;
  }

  auto resourceEntry = archiveEntry->mResourcesByCID.Lookup(aCID);
  if (!resourceEntry) {
    return false;
  }

  aContentType.Assign(resourceEntry->mContentType);
  aData.AppendElements(resourceEntry->mData);
  return true;
}

bool MHTMLArchiveStoreService::HasArchive(const nsACString& aArchiveId) {
  StaticMutexAutoLock lock(sMutex);

  if (!sArchives) {
    return false;
  }

  return sArchives->Contains(aArchiveId);
}

void MHTMLArchiveStoreService::SetURIToArchiveIdMapping(
    const nsACString& aURI, const nsACString& aArchiveId) {
  StaticMutexAutoLock lock(sMutex);

  if (!sURIToArchiveId) {
    sURIToArchiveId = new nsTHashMap<nsCStringHashKey, nsCString>();
  }

  sURIToArchiveId->InsertOrUpdate(nsCString(aURI), nsCString(aArchiveId));
}

bool MHTMLArchiveStoreService::GetArchiveIdForURI(const nsACString& aURI,
                                                  nsACString& aArchiveId) {
  StaticMutexAutoLock lock(sMutex);

  if (!sURIToArchiveId) {
    return false;
  }

  auto entry = sURIToArchiveId->Lookup(aURI);
  if (!entry) {
    return false;
  }

  aArchiveId.Assign(*entry);
  sURIToArchiveId->Remove(aURI);  // One-time use
  return true;
}

}  // namespace mozilla::dom
