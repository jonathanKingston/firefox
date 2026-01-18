/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MHTMLInterceptController.h"

#include "mozilla/dom/MHTMLArchiveStore.h"
#include "nsIChannel.h"
#include "nsILoadInfo.h"
#include "nsINetworkInterceptController.h"
#include "nsIURI.h"
#include "nsStringStream.h"

namespace mozilla::dom {

NS_IMPL_ISUPPORTS(MHTMLInterceptController, nsINetworkInterceptController)

NS_IMETHODIMP
MHTMLInterceptController::ShouldPrepareForIntercept(nsIURI* aURI,
                                                    nsIChannel* aChannel,
                                                    bool* aShouldIntercept) {
  *aShouldIntercept = false;

  if (!aChannel) {
    return NS_OK;
  }

  nsCOMPtr<nsILoadInfo> loadInfo = aChannel->LoadInfo();
  if (!loadInfo) {
    return NS_OK;
  }

  nsAutoCString archiveId;
  nsresult rv = loadInfo->GetMhtmlArchiveId(archiveId);
  NS_ENSURE_SUCCESS(rv, rv);

  if (archiveId.IsEmpty()) {
    return NS_OK;
  }

  // Only intercept HTTP(S) requests
  nsAutoCString scheme;
  aURI->GetScheme(scheme);
  if (!scheme.EqualsLiteral("http") && !scheme.EqualsLiteral("https")) {
    return NS_OK;
  }

  // Check if archive exists in the store
  if (!MHTMLArchiveStoreService::HasArchive(archiveId)) {
    return NS_OK;
  }

  *aShouldIntercept = true;
  return NS_OK;
}

NS_IMETHODIMP
MHTMLInterceptController::ChannelIntercepted(nsIInterceptedChannel* aChannel) {
  NS_ENSURE_ARG_POINTER(aChannel);

  nsCOMPtr<nsIChannel> inner;
  nsresult rv = aChannel->GetChannel(getter_AddRefs(inner));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIURI> uri;
  rv = aChannel->GetSecureUpgradedChannelURI(getter_AddRefs(uri));
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString spec;
  uri->GetSpec(spec);

  nsCOMPtr<nsILoadInfo> loadInfo = inner->LoadInfo();

  nsAutoCString archiveId;
  rv = loadInfo->GetMhtmlArchiveId(archiveId);
  NS_ENSURE_SUCCESS(rv, rv);

  if (archiveId.IsEmpty()) {
    aChannel->CancelInterception(NS_ERROR_DOM_SECURITY_ERR);
    return NS_OK;
  }

  // Look up resource in the parent-process store
  nsAutoCString contentType;
  nsTArray<uint8_t> data;
  bool found =
      MHTMLArchiveStoreService::GetResource(archiveId, spec, contentType, data);

  if (!found) {
    // Resource not in archive - block the external request
    aChannel->CancelInterception(NS_ERROR_FILE_NOT_FOUND);
    return NS_OK;
  }

  // Synthesize response from archive data
  nsCOMPtr<nsIInputStream> body;
  rv = NS_NewByteInputStream(getter_AddRefs(body), std::move(data));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = aChannel->SynthesizeStatus(200, "OK"_ns);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = aChannel->SynthesizeHeader("Content-Type"_ns, contentType);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = aChannel->StartSynthesizedResponse(body, nullptr, nullptr, ""_ns, false);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = aChannel->FinishSynthesizedResponse();
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

}  // namespace mozilla::dom
