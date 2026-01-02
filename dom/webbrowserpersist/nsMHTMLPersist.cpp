/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMHTMLPersist.h"

#include <cinttypes>
#include <cstdint>

#include "mozilla/Base64.h"
#include "mozilla/RandomNum.h"
#include "mozilla/TextUtils.h"
#include "nsCOMPtr.h"
#include "nsIInputStream.h"
#include "nsIOutputStream.h"
#include "nsIURI.h"
#include "nsNetUtil.h"
#include "nsString.h"
#include "prtime.h"

namespace mozilla {

MHTMLPersist::MHTMLPersist() = default;

MHTMLPersist::~MHTMLPersist() = default;

nsCString MHTMLPersist::GenerateBoundary() {
  uint64_t a = RandomUint64OrDie();
  uint64_t b = RandomUint64OrDie();
  return nsPrintfCString("----gecko_mhtml_%" PRIx64 "%" PRIx64, a, b);
}

nsresult MHTMLPersist::GetURLSpec(nsIURI* aURI, nsACString& aSpec) {
  if (!aURI) {
    return NS_ERROR_NULL_POINTER;
  }
  return aURI->GetSpec(aSpec);
}

nsresult MHTMLPersist::StartMHTMLArchive(
    nsIOutputStream* aStream, nsIURI* aMainDocumentURI,
    const nsACString& aMainDocumentCharset) {
  NS_ENSURE_ARG_POINTER(aStream);
  NS_ENSURE_ARG_POINTER(aMainDocumentURI);

  mStream = aStream;
  mMainDocumentURI = aMainDocumentURI;
  mBoundary = GenerateBoundary();

  nsAutoCString mainDocumentURL;
  nsresult rv = GetURLSpec(aMainDocumentURI, mainDocumentURL);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString dateStr;
  if (!mDateOverride.IsEmpty()) {
    dateStr = mDateOverride;
  } else {
    PRExplodedTime now;
    PR_ExplodeTime(PR_Now(), PR_GMTParameters, &now);
    char buf[100];
    PR_FormatTimeUSEnglish(buf, sizeof(buf), "%a, %d %b %Y %H:%M:%S GMT", &now);
    dateStr.Assign(buf);
  }

  nsAutoCString header;
  header.AppendLiteral("From: <Saved by Gecko>\r\n");
  header.AppendPrintf("Subject: %s\r\n", mainDocumentURL.get());
  header.AppendPrintf("Date: %s\r\n", dateStr.get());
  header.AppendPrintf("Snapshot-Content-Location: %s\r\n",
                      mainDocumentURL.get());
  header.AppendLiteral("MIME-Version: 1.0\r\n");
  header.AppendLiteral("Content-Type: multipart/related;\r\n");
  if (!aMainDocumentCharset.IsEmpty()) {
    header.AppendPrintf("\ttype=\"text/html; charset=%s\";\r\n",
                        PromiseFlatCString(aMainDocumentCharset).get());
  } else {
    header.AppendLiteral("\ttype=\"text/html\";\r\n");
  }
  header.AppendPrintf("\tboundary=\"%s\"\r\n", mBoundary.get());
  // MIME prologue before the first boundary (RFC 2046 sec 5.1.1).
  header.AppendLiteral("\r\nThis is a multi-part message in MIME format.\r\n");

  uint32_t written;
  rv = mStream->Write(header.get(), header.Length(), &written);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

nsresult MHTMLPersist::WriteBoundary(bool aFinal) {
  nsAutoCString boundary;
  boundary.AppendLiteral("\r\n--");
  boundary.Append(mBoundary);
  if (aFinal) {
    boundary.AppendLiteral("--");
  }
  boundary.AppendLiteral("\r\n");

  uint32_t written;
  nsresult rv = mStream->Write(boundary.get(), boundary.Length(), &written);
  NS_ENSURE_SUCCESS(rv, rv);
  return NS_OK;
}

nsresult MHTMLPersist::WriteHeader(const nsACString& aContentType, nsIURI* aURI,
                                   const nsACString& aEncoding,
                                   const nsACString& aCharset) {
  nsAutoCString header;

  header.AppendPrintf("Content-Type: %s",
                      PromiseFlatCString(aContentType).get());
  if (!aCharset.IsEmpty()) {
    header.AppendPrintf(";\r\n\tcharset=\"%s\"",
                        PromiseFlatCString(aCharset).get());
  }
  header.AppendLiteral("\r\n");

  if (!aEncoding.IsEmpty()) {
    header.AppendPrintf("Content-Transfer-Encoding: %s\r\n",
                        PromiseFlatCString(aEncoding).get());
  }

  if (aURI) {
    nsAutoCString spec;
    nsresult rv = GetURLSpec(aURI, spec);
    NS_ENSURE_SUCCESS(rv, rv);
    // Subresources use absolute URLs here; we do not emit Content-ID / cid:
    // references (some other MHTML producers do).
    header.AppendPrintf("Content-Location: %s\r\n", spec.get());
  }

  header.AppendLiteral("\r\n");

  uint32_t written;
  nsresult rv = mStream->Write(header.get(), header.Length(), &written);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

nsresult MHTMLPersist::WriteBase64Data(const uint8_t* aData,
                                       uint32_t aDataLen) {
  nsAutoCString base64;
  nsresult rv = Base64Encode(
      nsDependentCSubstring(reinterpret_cast<const char*>(aData), aDataLen),
      base64);
  NS_ENSURE_SUCCESS(rv, rv);

  const uint32_t kMaxLineLength = 76;
  uint32_t offset = 0;
  while (offset < base64.Length()) {
    uint32_t lineLength = std::min(
        kMaxLineLength, static_cast<uint32_t>(base64.Length() - offset));
    uint32_t written;
    rv = mStream->Write(base64.get() + offset, lineLength, &written);
    NS_ENSURE_SUCCESS(rv, rv);

    offset += lineLength;
    if (offset < base64.Length()) {
      rv = mStream->Write("\r\n", 2, &written);
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }

  return NS_OK;
}

nsresult MHTMLPersist::AddDocument(const nsACString& aContentType,
                                   const nsACString& aCharset,
                                   const nsACString& aContent,
                                   nsIURI* aDocumentURI) {
  nsresult rv = WriteBoundary(false);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString encoding;
  bool needsBase64 = false;
  for (uint32_t i = 0; i < aContent.Length(); i++) {
    if (!IsAscii(aContent[i])) {
      needsBase64 = true;
      break;
    }
  }

  if (needsBase64) {
    encoding.Assign("base64"_ns);
    rv = WriteHeader(aContentType, aDocumentURI, encoding, aCharset);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = WriteBase64Data(
        reinterpret_cast<const uint8_t*>(aContent.BeginReading()),
        aContent.Length());
  } else {
    encoding.Assign("7bit"_ns);
    rv = WriteHeader(aContentType, aDocumentURI, encoding, aCharset);
    NS_ENSURE_SUCCESS(rv, rv);

    uint32_t written;
    rv = mStream->Write(aContent.BeginReading(), aContent.Length(), &written);
  }

  NS_ENSURE_SUCCESS(rv, rv);
  return NS_OK;
}

nsresult MHTMLPersist::AddResource(nsIURI* aResourceURI,
                                   const nsACString& aContentType,
                                   const uint8_t* aData, uint32_t aDataLen) {
  nsresult rv = WriteBoundary(false);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = WriteHeader(aContentType, aResourceURI, "base64"_ns, ""_ns);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = WriteBase64Data(aData, aDataLen);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

nsresult MHTMLPersist::FinishMHTMLArchive() {
  nsresult rv = WriteBoundary(true);
  NS_ENSURE_SUCCESS(rv, rv);

  mStream = nullptr;
  return NS_OK;
}

}  // namespace mozilla
