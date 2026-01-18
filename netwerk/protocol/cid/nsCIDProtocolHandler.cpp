/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsCIDProtocolHandler.h"
#include "nsIChannel.h"
#include "nsILoadInfo.h"
#include "nsIURI.h"
#include "nsNetUtil.h"
#include "nsSimpleURI.h"
#include "nsStringStream.h"
#include "mozilla/dom/MHTMLArchiveStore.h"

namespace mozilla::net {

NS_IMPL_ISUPPORTS(nsCIDProtocolHandler, nsIProtocolHandler,
                  nsISupportsWeakReference)

/* static */
nsresult nsCIDProtocolHandler::Create(const nsIID& aIID, void** aResult) {
  RefPtr<nsCIDProtocolHandler> handler = new nsCIDProtocolHandler();
  return handler->QueryInterface(aIID, aResult);
}

/* static */
nsresult nsCIDProtocolHandler::CreateNewURI(const nsACString& aSpec,
                                            const char* aCharset,
                                            nsIURI* aBaseURI,
                                            nsIURI** aResult) {
  nsCOMPtr<nsIURI> uri;
  nsresult rv = NS_MutateURI(new nsSimpleURI::Mutator())
                    .SetSpec(aSpec)
                    .Finalize(getter_AddRefs(uri));
  NS_ENSURE_SUCCESS(rv, rv);
  uri.forget(aResult);
  return NS_OK;
}

NS_IMETHODIMP
nsCIDProtocolHandler::GetScheme(nsACString& aResult) {
  aResult.AssignLiteral("cid");
  return NS_OK;
}

NS_IMETHODIMP
nsCIDProtocolHandler::NewChannel(nsIURI* aURI, nsILoadInfo* aLoadInfo,
                                 nsIChannel** aResult) {
  NS_ENSURE_ARG_POINTER(aURI);
  NS_ENSURE_ARG_POINTER(aLoadInfo);

  nsAutoCString archiveId;
  nsresult rv = aLoadInfo->GetMhtmlArchiveId(archiveId);
  NS_ENSURE_SUCCESS(rv, rv);

  if (archiveId.IsEmpty()) {
    return NS_ERROR_DOM_SECURITY_ERR;
  }

  // Extract Content-ID from URI path (e.g., "css-123@mhtml.blink" from
  // "cid:css-123@mhtml.blink")
  nsAutoCString cid;
  rv = aURI->GetPathQueryRef(cid);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString contentType;
  nsTArray<uint8_t> data;

  // First try looking up by Content-ID (the path without cid: prefix)
  bool found = dom::MHTMLArchiveStoreService::GetResourceByCID(
      archiveId, cid, contentType, data);

  // If not found, try looking up by the full cid: URL as Content-Location
  // Some MHTML files use Content-Location: cid:xxx instead of Content-ID: <xxx>
  if (!found) {
    nsAutoCString fullURL;
    rv = aURI->GetSpec(fullURL);
    if (NS_SUCCEEDED(rv)) {
      found = dom::MHTMLArchiveStoreService::GetResource(archiveId, fullURL,
                                                         contentType, data);
    }
  }

  if (!found) {
    return NS_ERROR_FILE_NOT_FOUND;
  }

  nsCOMPtr<nsIInputStream> stream;
  rv = NS_NewByteInputStream(getter_AddRefs(stream), std::move(data));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIChannel> channel;
  rv = NS_NewInputStreamChannelInternal(getter_AddRefs(channel), aURI,
                                        stream.forget(), contentType, ""_ns,
                                        aLoadInfo);
  NS_ENSURE_SUCCESS(rv, rv);

  channel.forget(aResult);
  return NS_OK;
}

NS_IMETHODIMP
nsCIDProtocolHandler::AllowPort(int32_t aPort, const char* aScheme,
                                bool* aResult) {
  *aResult = false;
  return NS_OK;
}

}  // namespace mozilla::net
