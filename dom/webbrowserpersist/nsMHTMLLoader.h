/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsMHTMLLoader_h__
#define nsMHTMLLoader_h__

#include "nsCOMPtr.h"
#include "nsIInputStream.h"
#include "nsIURI.h"
#include "nsString.h"
#include "nsTHashMap.h"

namespace mozilla {

/**
 * Parsed MHTML part (resource) from a multipart/related archive
 */
struct MHTMLPart {
  nsCString contentType;
  nsCString contentLocation;
  nsCString transferEncoding;
  nsCString body;
  
  MHTMLPart() = default;
};

/**
 * Loader for MHTML (MIME Encapsulation of Aggregate HTML Documents)
 * Parses multipart/related MIME structure and extracts HTML + resources
 * 
 * Usage:
 *   RefPtr<MHTMLLoader> loader = MakeMHTMLLoader(aURI, mhtmlContent);
 *   nsresult rv = loader->Parse();
 *   NS_ENSURE_SUCCESS(rv, rv);
 *   
 *   nsCString html;
 *   rv = loader->GetMainHTML(html);
 *   
 *   nsTHashMap<nsCString, nsCString> resourceMap;
 *   rv = loader->GetResourceMap(resourceMap);
 */
class MHTMLLoader {
 public:
  NS_INLINE_DECL_REFCOUNTING(MHTMLLoader)

  MHTMLLoader(nsIURI* aBaseURI, const nsACString& aMHTMLContent);

  /**
   * Parse the MHTML content and extract all parts
   * @return NS_OK on success, error code on failure
   */
  nsresult Parse();

  /**
   * Get the main HTML content (decoded from the first text/html part)
   * @param aHTML Output parameter for HTML content
   * @return NS_OK if HTML found, NS_ERROR_NOT_AVAILABLE if not
   */
  nsresult GetMainHTML(nsACString& aHTML);

  /**
   * Get a map of resource URLs to data: URLs
   * All embedded resources (images, CSS, fonts) as Base64 data: URLs
   * @param aResourceMap Output parameter for resource map
   * @return NS_OK on success
   */
  nsresult GetResourceMap(nsTHashMap<nsCString, nsCString>& aResourceMap);

  /**
   * Apply URL rewriting and security policies to HTML
   * Rewrites src/href attributes to use data: URLs from resource map
   * Replaces unmapped external URLs with about:blank (security)
   * Injects Content Security Policy (defense-in-depth)
   * 
   * @param aHTML HTML content to process (modified in place)
   * @param aResourceMap Map of URLs to data: URLs
   * @return NS_OK on success
   */
  static nsresult ProcessHTML(nsACString& aHTML,
                               const nsTHashMap<nsCString, nsCString>& aResourceMap);

 private:
  ~MHTMLLoader();

  /**
   * Extract MIME boundary from Content-Type header
   */
  nsresult ExtractBoundary(nsCString& aBoundary);

  /**
   * Parse a single MHTML part (headers + body)
   * @param aPartContent Raw part content including headers
   * @param aPart Output parameter for parsed part
   */
  nsresult ParsePart(const nsACString& aPartContent, MHTMLPart& aPart);

  /**
   * Decode a body based on transfer encoding
   * @param aBody Encoded body content
   * @param aEncoding Transfer encoding (quoted-printable, base64, etc.)
   * @param aDecoded Output parameter for decoded content
   */
  nsresult DecodeBody(const nsACString& aBody, const nsACString& aEncoding,
                      nsACString& aDecoded);

  /**
   * Decode Quoted-Printable encoding
   */
  nsresult DecodeQuotedPrintable(const nsACString& aEncoded,
                                  nsACString& aDecoded);

  /**
   * Convert a resource to a data: URL
   * @param aContentType MIME type (e.g., "image/png")
   * @param aData Resource data
   * @param aDataURL Output parameter for data: URL
   */
  nsresult CreateDataURL(const nsACString& aContentType,
                         const nsACString& aData, nsACString& aDataURL);

  /**
   * Rewrite URLs in HTML (src= and href= attributes)
   */
  static nsresult RewriteURLs(nsACString& aHTML,
                               const nsTHashMap<nsCString, nsCString>& aResourceMap);

  /**
   * Inject Content Security Policy meta tag
   */
  static nsresult InjectCSP(nsACString& aHTML);

  nsCOMPtr<nsIURI> mBaseURI;
  nsCString mMHTMLContent;
  nsTArray<MHTMLPart> mParts;
  nsCString mMainHTML;
  nsTHashMap<nsCString, nsCString> mResourceMap;
  bool mParsed;
};

}  // namespace mozilla

#endif  // nsMHTMLLoader_h__

