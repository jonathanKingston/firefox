/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_MHTMLInterceptController_h
#define mozilla_dom_MHTMLInterceptController_h

#include "nsINetworkInterceptController.h"
#include "nsISupportsImpl.h"

namespace mozilla {
namespace dom {

class MHTMLInterceptController final : public nsINetworkInterceptController {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSINETWORKINTERCEPTCONTROLLER

  MHTMLInterceptController() = default;

 private:
  ~MHTMLInterceptController() = default;
};

}  // namespace dom
}  // namespace mozilla

#endif  // mozilla_dom_MHTMLInterceptController_h
