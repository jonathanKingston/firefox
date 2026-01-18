/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsMHTMLPersist_h__
#define nsMHTMLPersist_h__

#include "nsCOMPtr.h"
#include "nsIOutputStream.h"
#include "nsIURI.h"
#include "nsString.h"
#include "nsTArray.h"
#include "nsTHashMap.h"

namespace mozilla {

class MHTMLPersist {
 public:
  MHTMLPersist();
  ~MHTMLPersist();

  nsresult StartMHTMLArchive(nsIOutputStream* aStream, nsIURI* aMainDocumentURI,
                             const nsACString& aMainDocumentCharset);
  nsresult AddDocument(const nsACString& aContentType,
                       const nsACString& aCharset, const nsACString& aContent,
                       nsIURI* aDocumentURI);
  nsresult AddResource(nsIURI* aResourceURI, const nsACString& aContentType,
                       const uint8_t* aData, uint32_t aDataLen);
  nsresult FinishMHTMLArchive();

  nsCString GenerateContentID();
  void RegisterURLToCID(const nsACString& aURL, const nsACString& aCID);
  void GetURLToCIDMap(nsTHashMap<nsCStringHashKey, nsCString>& aOutMap) const;

 private:
  nsresult WriteBoundary(bool aFinal);
  nsresult WriteHeaderWithCID(const nsACString& aContentType,
                              const nsACString& aContentID,
                              const nsACString& aEncoding,
                              const nsACString& aCharset);
  nsresult WriteBase64Data(const uint8_t* aData, uint32_t aDataLen);
  nsresult WriteQuotedPrintable(const nsACString& aData);

  nsCString GenerateBoundary();
  nsresult GetURLSpec(nsIURI* aURI, nsACString& aSpec);

  nsCOMPtr<nsIOutputStream> mStream;
  nsCString mBoundary;
  nsCOMPtr<nsIURI> mMainDocumentURI;
  bool mFirstPart;
  uint32_t mCIDCounter;
  nsTHashMap<nsCStringHashKey, nsCString> mURLToCIDMap;
};

}  // namespace mozilla

#endif
