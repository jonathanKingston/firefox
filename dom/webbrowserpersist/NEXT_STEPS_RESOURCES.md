# Resource Loading Implementation - Next Steps

## Current State

✅ **Working:**
- MHTML export (Chrome-compatible)
- `.mhtml` file detection
- Full MHTML parsing using MHTMLArchive.sys.mjs
- HTML extraction and rendering
- `mMHTMLArchive` stored on nsDocShell

⚠️ **Partial:**
- Parse complete, but resources (images/CSS/fonts) don't load

## Why Resources Don't Load

HTML contains:
```html
<img src="https://example.com/logo.png">
```

Browser tries to fetch `https://example.com/logo.png` from network → Fails
But image is actually in MHTML archive (Base64 encoded)

## Implementation Approach (Chrome's Method)

### Step 1: Store Archive ✅ DONE
```cpp
// In nsDocShell.h:
JS::Heap<JSObject*> mMHTMLArchive;

// In LoadMHTMLFile():
mMHTMLArchive = archive;  // Store JS object
```

### Step 2: Intercept Resource Loads (TODO)

**Option A: Intercept in nsDocLoader::OnStartRequest**

```cpp
// In docshell/base/nsDocLoader.cpp

NS_IMETHODIMP nsDocLoader::OnStartRequest(nsIRequest* request) {
  nsCOMPtr<nsIChannel> channel = do_QueryInterface(request);
  if (!channel) {
    return NS_OK;
  }

  // Check if this docshell has MHTML archive
  nsDocShell* docShell = static_cast<nsDocShell*>(this);
  if (docShell && docShell->HasMHTMLArchive()) {
    nsCOMPtr<nsIURI> uri;
    channel->GetURI(getter_AddRefs(uri));
    
    // Try to serve from archive
    nsresult rv = docShell->TryServeMHTMLResource(channel, uri);
    if (NS_SUCCEEDED(rv)) {
      // Resource served from archive, cancel network load
      request->Cancel(NS_BINDING_ABORTED);
      return NS_OK;
    }
  }

  // Normal flow
  return OnStartRequestImpl(request);
}
```

**Option B: Intercept Earlier (AsyncOnChannelRedirect)**

```cpp
// In docshell/base/nsDocShell.cpp

NS_IMETHODIMP
nsDocShell::AsyncOnChannelRedirect(nsIChannel* oldChannel,
                                    nsIChannel* newChannel,
                                    uint32_t flags,
                                    nsIAsyncVerifyRedirectCallback* callback) {
  // Check for MHTML resource before redirect
  if (mMHTMLArchive) {
    nsCOMPtr<nsIURI> uri;
    newChannel->GetURI(getter_AddRefs(uri));
    
    if (HasMHTMLResource(uri)) {
      // Create synthetic channel for resource
      nsCOMPtr<nsIChannel> mhtmlChannel;
      CreateMHTMLResourceChannel(uri, getter_AddRefs(mhtmlChannel));
      
      // Redirect to synthetic channel
      newChannel = mhtmlChannel;
    }
  }
  
  callback->OnRedirectVerifyCallback(NS_OK);
  return NS_OK;
}
```

### Step 3: Serve Resource from Archive

```cpp
// In docshell/base/nsDocShell.h
public:
  bool HasMHTMLArchive() const { return mMHTMLArchive.get() != nullptr; }
  nsresult TryServeMHTMLResource(nsIChannel* aChannel, nsIURI* aURI);

// In docshell/base/nsDocShell.cpp
nsresult nsDocShell::TryServeMHTMLResource(nsIChannel* aChannel, nsIURI* aURI) {
  if (!mMHTMLArchive) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  // Get global for JS context
  nsCOMPtr<nsIGlobalObject> global = GetScriptGlobalObject();
  if (!global) {
    return NS_ERROR_FAILURE;
  }

  dom::AutoJSAPI jsapi;
  if (!jsapi.Init(global)) {
    return NS_ERROR_FAILURE;
  }

  JSContext* cx = jsapi.cx();
  JS::Rooted<JSObject*> archive(cx, mMHTMLArchive);

  // Call archive.getResourceData(uri)
  JS::Rooted<JS::Value> getResourceFn(cx);
  if (!JS_GetProperty(cx, archive, "getResourceData", &getResourceFn)) {
    return NS_ERROR_FAILURE;
  }

  JS::Rooted<JS::Value> uriArg(cx);
  nsContentUtils::WrapNative(cx, aURI, &NS_GET_IID(nsIURI), &uriArg);

  JS::RootedVector<JS::Value> args(cx);
  args.append(uriArg);

  JS::Rooted<JS::Value> resourceData(cx);
  if (!JS::Call(cx, archive, getResourceFn, args, &resourceData)) {
    return NS_ERROR_FAILURE;
  }

  if (resourceData.isNull() || resourceData.isUndefined()) {
    return NS_ERROR_NOT_AVAILABLE;  // Resource not in archive
  }

  // Convert Uint8Array to nsIInputStream
  JSObject* dataObj = &resourceData.toObject();
  if (!JS_IsUint8Array(dataObj)) {
    return NS_ERROR_FAILURE;
  }

  bool isShared;
  uint32_t length;
  bool isAnyArray;
  uint8_t* data = JS_GetUint8ArrayData(dataObj, &isShared, &length, &isAnyArray);
  
  if (!data) {
    return NS_ERROR_FAILURE;
  }

  // Create input stream from data
  nsCOMPtr<nsIInputStream> stream;
  nsresult rv = NS_NewByteInputStream(
      getter_AddRefs(stream),
      mozilla::Span(reinterpret_cast<const char*>(data), length),
      NS_ASSIGNMENT_COPY);
  
  if (NS_FAILED(rv)) {
    return rv;
  }

  // Replace channel content with archive data
  nsCOMPtr<nsIInputStreamChannel> inputChannel = do_QueryInterface(aChannel);
  if (inputChannel) {
    inputChannel->SetContentStream(stream);
    return NS_OK;
  }

  return NS_ERROR_FAILURE;
}
```

### Step 4: Handle GC

```cpp
// In docshell/base/nsDocShell.h
class nsDocShell : public nsIDocShell, ... {
  NS_DECL_CYCLE_COLLECTING_ISUPPORTS
  NS_DECL_CYCLE_COLLECTION_SCRIPT_HOLDER_CLASS(nsDocShell)
};

// In docshell/base/nsDocShell.cpp
NS_IMPL_CYCLE_COLLECTION_CLASS(nsDocShell)

NS_IMPL_CYCLE_COLLECTION_UNLINK_BEGIN(nsDocShell)
  // ... existing unlinks
  tmp->mMHTMLArchive = nullptr;
NS_IMPL_CYCLE_COLLECTION_UNLINK_END

NS_IMPL_CYCLE_COLLECTION_TRAVERSE_BEGIN(nsDocShell)
  // ... existing traversals
NS_IMPL_CYCLE_COLLECTION_TRAVERSE_END

NS_IMPL_CYCLE_COLLECTION_TRACE_BEGIN(nsDocShell)
  NS_IMPL_CYCLE_COLLECTION_TRACE_JS_MEMBER_CALLBACK(mMHTMLArchive)
NS_IMPL_CYCLE_COLLECTION_TRACE_END
```

## Alternative: Data URL Rewriting (Simpler)

Instead of intercepting, rewrite URLs before loading:

```cpp
// In LoadMHTMLFile(), after getting HTML:

// Rewrite all resource URLs to data: URLs
nsresult rv = RewriteResourceURLs(htmlContent, archive, cx);

nsCOMPtr<nsIInputStream> htmlStream;
rv = NS_NewCStringInputStream(getter_AddRefs(htmlStream), htmlContent);
```

```cpp
nsresult RewriteResourceURLs(nsCString& aHTML, 
                              JS::Handle<JSObject*> aArchive,
                              JSContext* cx) {
  // Find all src= and href= attributes
  // For each URL, get resource from archive
  // Convert to data: URL
  // Replace in HTML
  
  // Example: <img src="logo.png"> 
  // → <img src="data:image/png;base64,iVBORw0KG...">
}
```

**Pros:**
- Simpler (no channel interception)
- Self-contained (no special loading)

**Cons:**
- Higher memory (all resources as data: URLs)
- Slower initial load (parse + rewrite HTML)
- Less efficient for large images

## Recommended Next Steps

### Phase 1: Simple Data URL Rewriting (~1 day)
1. Parse HTML for src/href attributes
2. Look up resources in archive
3. Convert to data: URLs
4. Load rewritten HTML

**Good for:** Quick win, proof of concept

### Phase 2: Full Channel Interception (~2-3 days)
1. Add GC handling for mMHTMLArchive
2. Implement TryServeMHTMLResource()
3. Hook into OnStartRequest or AsyncOnChannelRedirect
4. Handle content-type detection
5. Test with complex pages

**Good for:** Production, efficiency

## Testing

```bash
# Create test MHTML with images
./mach run
# Save page with images as MHTML
# Open saved MHTML
# Verify images display

# Test files:
# - Simple: text + 1 image
# - Complex: CSS + fonts + multiple images
# - Large: High-res images (test memory)
```

## Current Build Status

✅ Builds successfully
✅ Archive creation works
✅ HTML extraction works
⚠️ Resources need interception (this document)

## Files to Modify

### For Data URL Approach:
- `docshell/base/nsDocShell.cpp` - Add RewriteResourceURLs()

### For Channel Interception:
- `docshell/base/nsDocShell.h` - Add TryServeMHTMLResource()
- `docshell/base/nsDocShell.cpp` - Implement interception
- `docshell/base/nsDocLoader.cpp` - Hook OnStartRequest

## Estimated Effort

- **Data URL rewriting:** 1 day
- **Channel interception:** 2-3 days
- **Testing + polish:** 1 day

**Total for complete implementation:** 3-4 days

---

**Current code is ready for resource loading - just need to add interception logic.**

