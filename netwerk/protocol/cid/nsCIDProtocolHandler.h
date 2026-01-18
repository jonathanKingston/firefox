/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsCIDProtocolHandler_h___
#define nsCIDProtocolHandler_h___

#include "nsIProtocolHandler.h"
#include "nsWeakReference.h"

namespace mozilla {
namespace net {

class nsCIDProtocolHandler final : public nsIProtocolHandler,
                                   public nsSupportsWeakReference {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIPROTOCOLHANDLER

  nsCIDProtocolHandler() = default;

  [[nodiscard]] static nsresult Create(const nsIID& aIID, void** aResult);

  static nsresult CreateNewURI(const nsACString& aSpec, const char* aCharset,
                               nsIURI* aBaseURI, nsIURI** aResult);

 private:
  ~nsCIDProtocolHandler() = default;
};

}  // namespace net
}  // namespace mozilla

#endif  // nsCIDProtocolHandler_h___
