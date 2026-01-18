/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MHTMLArchiveRegistryService.h"

#include "MHTMLArchive.h"
#include "mozilla/ClearOnShutdown.h"
#include "nsID.h"

namespace mozilla::dom {

StaticRefPtr<MHTMLArchiveRegistryService>
    MHTMLArchiveRegistryService::sSingleton;

NS_IMPL_ISUPPORTS(MHTMLArchiveRegistryService, nsIMHTMLArchiveRegistry)

/* static */
already_AddRefed<MHTMLArchiveRegistryService>
MHTMLArchiveRegistryService::GetOrCreate() {
  if (!sSingleton) {
    sSingleton = new MHTMLArchiveRegistryService();
    ClearOnShutdown(&sSingleton);
  }
  return do_AddRef(sSingleton);
}

/* static */
MHTMLArchive* MHTMLArchiveRegistryService::Lookup(const nsACString& aId) {
  if (!sSingleton) {
    return nullptr;
  }

  auto entry = sSingleton->mArchives.Lookup(aId);
  return entry ? entry->mArchive.get() : nullptr;
}

NS_IMETHODIMP
MHTMLArchiveRegistryService::Register(nsIMHTMLArchive* aArchive,
                                      uint64_t aInnerWindowId,
                                      nsACString& aResult) {
  RefPtr<MHTMLArchive> archive = static_cast<MHTMLArchive*>(aArchive);
  if (!archive) {
    return NS_ERROR_INVALID_ARG;
  }

  nsID uuid = nsID::GenerateUUID();
  nsCString id(nsIDToCString(uuid).get());

  Entry entry;
  entry.mArchive = archive;
  entry.mInnerWindowId = aInnerWindowId;

  mArchives.InsertOrUpdate(id, std::move(entry));
  aResult = id;

  return NS_OK;
}

NS_IMETHODIMP
MHTMLArchiveRegistryService::Unregister(const nsACString& aId) {
  mArchives.Remove(aId);
  return NS_OK;
}

NS_IMETHODIMP
MHTMLArchiveRegistryService::UnregisterForWindow(uint64_t aInnerWindowId) {
  if (aInnerWindowId == 0) {
    return NS_OK;
  }

  nsTArray<nsCString> toRemove;
  for (const auto& entry : mArchives) {
    if (entry.GetData().mInnerWindowId == aInnerWindowId) {
      toRemove.AppendElement(entry.GetKey());
    }
  }

  for (const auto& key : toRemove) {
    mArchives.Remove(key);
  }

  return NS_OK;
}

NS_IMETHODIMP
MHTMLArchiveRegistryService::SetWindowIdForArchive(const nsACString& aArchiveId,
                                                   uint64_t aInnerWindowId) {
  auto entry = mArchives.Lookup(aArchiveId);
  if (entry) {
    entry->mInnerWindowId = aInnerWindowId;
  }
  return NS_OK;
}

}  // namespace mozilla::dom
