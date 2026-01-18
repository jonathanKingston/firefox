/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMHTMLPersist.h"

#include <cstdint>

#include "mozilla/Base64.h"
#include "mozilla/TextUtils.h"
#include "nsCOMPtr.h"
#include "nsCRT.h"
#include "nsIInputStream.h"
#include "nsIOutputStream.h"
#include "nsIURI.h"
#include "nsNetUtil.h"
#include "nsString.h"
#include "prtime.h"

namespace mozilla {

MHTMLPersist::MHTMLPersist() : mFirstPart(true), mCIDCounter(0) {}

MHTMLPersist::~MHTMLPersist() {}

nsCString MHTMLPersist::GenerateContentID() {
  return nsPrintfCString("res-%u@mhtml.firefox", ++mCIDCounter);
}

void MHTMLPersist::RegisterURLToCID(const nsACString& aURL,
                                    const nsACString& aCID) {
  mURLToCIDMap.InsertOrUpdate(nsCString(aURL), nsCString(aCID));
}

void MHTMLPersist::GetURLToCIDMap(
    nsTHashMap<nsCStringHashKey, nsCString>& aOutMap) const {
  for (const auto& entry : mURLToCIDMap) {
    aOutMap.InsertOrUpdate(entry.GetKey(), entry.GetData());
  }
}

nsCString MHTMLPersist::GenerateBoundary() {
  PRExplodedTime now;
  PR_ExplodeTime(PR_Now(), PR_LocalTimeParameters, &now);

  return nsPrintfCString(
      "----MultipartBoundary--"
      "%04hd%02d%02d%02d%02d%02d",
      now.tm_year, now.tm_month + 1, now.tm_mday, now.tm_hour, now.tm_min,
      now.tm_sec);
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
  mFirstPart = true;

  nsAutoCString mainDocumentURL;
  nsresult rv = GetURLSpec(aMainDocumentURI, mainDocumentURL);
  NS_ENSURE_SUCCESS(rv, rv);

  PRExplodedTime now;
  PR_ExplodeTime(PR_Now(), PR_LocalTimeParameters, &now);
  char dateStr[100];
  PR_FormatTimeUSEnglish(dateStr, sizeof(dateStr), "%a, %d %b %Y %H:%M:%S %z",
                         &now);

  nsAutoCString header;
  header.AppendLiteral("From: <Saved by Firefox>\r\n");
  header.AppendPrintf("Subject: %s\r\n", mainDocumentURL.get());
  header.AppendPrintf("Date: %s\r\n", dateStr);
  header.AppendLiteral("MIME-Version: 1.0\r\n");
  header.AppendPrintf("Content-Type: multipart/related;\r\n");
  header.AppendPrintf("\ttype=\"text/html\";\r\n");
  header.AppendPrintf("\tboundary=\"%s\"\r\n", mBoundary.get());
  header.AppendLiteral("\r\n");

  uint32_t written;
  rv = mStream->Write(header.get(), header.Length(), &written);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

nsresult MHTMLPersist::WriteBoundary(bool aFinal) {
  nsAutoCString boundary;
  if (!mFirstPart) {
    boundary.AppendLiteral("\r\n");
  }
  boundary.AppendLiteral("--");
  boundary.Append(mBoundary);
  if (aFinal) {
    boundary.AppendLiteral("--");
  }
  boundary.AppendLiteral("\r\n");

  uint32_t written;
  nsresult rv = mStream->Write(boundary.get(), boundary.Length(), &written);
  NS_ENSURE_SUCCESS(rv, rv);

  mFirstPart = false;
  return NS_OK;
}

nsresult MHTMLPersist::WriteHeaderWithCID(const nsACString& aContentType,
                                          const nsACString& aContentID,
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

  if (!aContentID.IsEmpty()) {
    header.AppendPrintf("Content-ID: <%s>\r\n",
                        PromiseFlatCString(aContentID).get());
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

nsresult MHTMLPersist::WriteQuotedPrintable(const nsACString& aData) {
  const char* data = aData.BeginReading();
  uint32_t len = aData.Length();
  uint32_t lineLen = 0;
  nsAutoCString output;

  for (uint32_t i = 0; i < len; i++) {
    unsigned char c = static_cast<unsigned char>(data[i]);

    // Soft line break if approaching limit
    if (lineLen >= 73) {
      output.AppendLiteral("=\r\n");
      lineLen = 0;
    }

    // Handle line endings
    if (c == '\r') {
      if (i + 1 < len && data[i + 1] == '\n') {
        output.AppendLiteral("\r\n");
        i++;  // Skip the \n
      } else {
        output.AppendLiteral("=0D");
        lineLen += 3;
      }
      lineLen = 0;
      continue;
    }

    if (c == '\n') {
      output.AppendLiteral("\r\n");
      lineLen = 0;
      continue;
    }

    // Encode non-printable, '=', and high-bit chars
    // Also encode space/tab at end of line
    bool atEOL = (i + 1 >= len || data[i + 1] == '\r' || data[i + 1] == '\n');
    if (c == '=' || c < 32 || c > 126 || ((c == ' ' || c == '\t') && atEOL)) {
      output.AppendPrintf("=%02X", c);
      lineLen += 3;
    } else {
      output.Append(static_cast<char>(c));
      lineLen++;
    }
  }

  uint32_t written;
  return mStream->Write(output.get(), output.Length(), &written);
}

nsresult MHTMLPersist::AddDocument(const nsACString& aContentType,
                                   const nsACString& aCharset,
                                   const nsACString& aContent,
                                   nsIURI* aDocumentURI) {
  nsresult rv = WriteBoundary(false);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString contentID = GenerateContentID();

  if (aDocumentURI) {
    nsAutoCString spec;
    rv = GetURLSpec(aDocumentURI, spec);
    if (NS_SUCCEEDED(rv)) {
      RegisterURLToCID(spec, contentID);
    }
  }

  nsAutoCString encoding;
  bool needsBase64 = false;
  for (uint32_t i = 0; i < aContent.Length(); i++) {
    if (!IsAscii(aContent[i])) {
      needsBase64 = true;
      break;
    }
  }

  if (needsBase64) {
    encoding.AssignLiteral("base64");
    rv = WriteHeaderWithCID(aContentType, contentID, encoding, aCharset);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = WriteBase64Data(
        reinterpret_cast<const uint8_t*>(aContent.BeginReading()),
        aContent.Length());
  } else {
    encoding.AssignLiteral("quoted-printable");
    rv = WriteHeaderWithCID(aContentType, contentID, encoding, aCharset);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = WriteQuotedPrintable(aContent);
  }

  NS_ENSURE_SUCCESS(rv, rv);
  return NS_OK;
}

nsresult MHTMLPersist::AddResource(nsIURI* aResourceURI,
                                   const nsACString& aContentType,
                                   const uint8_t* aData, uint32_t aDataLen) {
  nsresult rv = WriteBoundary(false);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString spec;
  nsCString contentID;

  if (aResourceURI) {
    rv = GetURLSpec(aResourceURI, spec);
    NS_ENSURE_SUCCESS(rv, rv);

    if (nsCString* existingCID = mURLToCIDMap.Lookup(spec).DataPtrOrNull()) {
      contentID = *existingCID;
    } else {
      contentID = GenerateContentID();
      RegisterURLToCID(spec, contentID);
    }
  } else {
    contentID = GenerateContentID();
  }

  rv = WriteHeaderWithCID(aContentType, contentID, "base64"_ns, ""_ns);
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
