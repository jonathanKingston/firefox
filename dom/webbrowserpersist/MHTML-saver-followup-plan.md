# MHTML saver follow-up plan

Consolidates review feedback (dmcintosh), validation against the tree, and Chromium/Blink export behavior into one work plan.

## 1. `nsMHTMLPersist.cpp` — archive format and testability

| Item | Source | Status in tree | Proposed work |
|------|--------|----------------|---------------|
| Boundary | Review (RFC 2045, avoid datetime in boundary) | `GenerateBoundary()` still uses local date/time in the string | Use a fixed RFC-safe boundary (e.g. `--gecko-boundary=_--`) or prefix + entropy (Blink-style), not wall-clock; document collision avoidance with QP if fixed. |
| Date / time | Review (UTC, injectable time for tests) | `PR_LocalTimeParameters` + `PR_FormatTimeUSEnglish` for `Date:` | Use UTC for `Date:`; optionally inject clock for stable golden-file tests. |
| `From:` line | Review + Blink | `From: <Saved by Firefox>` | Prefer `<Saved by Gecko>` or `MOZ_APP_BASENAME` (or equivalent). |
| First-part / boundary prologue | Review | `mFirstPart` + conditional leading `\r\n` in `WriteBoundary` | Add prologue after headers and drop `mFirstPart`, or keep with rationale in review if churn is not worth it. |
| `AddDocument` vs `AddResource` | Review | Two APIs; document = string, resource = bytes | Optional refactor: single path over `nsIInputStream`; schedule only if API shape change is desired. |
| Encoding literals | Review | Document path uses `AssignLiteral`; resources use `_ns` | Normalize to `_ns` or shared constants for transfer-encoding names. |
| QP heuristic | Review | Non-ASCII to base64; else labeled QP with raw write | Document heuristic and edge cases (nulls, binary); consider real QP encoder or stricter rules later. |
| CID vs `Content-Location` | Review + Blink | Only `Content-Location` on parts | Interop deep-dive: Blink uses `Content-ID` and `cid:…` in HTML. Decide whether Gecko must generate CIDs and rewrite references; document limits if not. |

## 2. `nsWebBrowserPersist.cpp` — cleanup and comments

| Item | Source | Status in tree | Proposed work |
|------|--------|----------------|---------------|
| Dead code in `OnStartRequest` | Review | `GetURI` into unused `uri` | Remove the no-op block or use `uri` meaningfully. |
| Stray whitespace / churn | Review | Not obvious in sampled hunks | Re-scan the full MHTML-related diff for stray blank lines. |
| `SaveChannelInternal` comment | Review | MHTML-specific wording on shared path after `mOutputMap.InsertOrUpdate` | Re-read flow with `MakeOutputStream`; rephrase or move comment so it is accurate for all callers. |

## 3. Tests, modules, and layout

| Item | Source | Status | Proposed work |
|------|--------|--------|---------------|
| `MHTMLArchive.sys.mjs` | Review | Not found in a quick checkout | On the revision branch: confirm role; document or trim if save-side unrelated. |
| `browser_mhtml_reftest_generator.js` | Review | Not found here | Add generator or document how refs are produced; split save vs view tests if still desired. |
| Tests under `toolkit/components/windowcreator` | Review | `browser_persist_mhtml.js` still in `browser.toml` | Decide ownership (location); add brief rationale if intentional. |
| Deterministic output | Review + section 1 | Depends on boundary/date | Add golden tests once boundary and date are stable. |

## 4. Optional Blink-aligned enhancements

| Item | Source | Proposed work |
|------|--------|---------------|
| `Snapshot-Content-Location` | Blink | Optional root snapshot header for tool parity with Chrome. |
| QP body vs label | Blink uses real QP on HTML | If header says quoted-printable, encode body as QP or change the label. |
| Boundary style | Blink | Fixed prefix + long random suffix as alternative to fully fixed boundary. |

## 5. Suggested sequencing

1. Quick fixes: dead `OnStartRequest` block; accurate `SaveChannelInternal` comment; whitespace scan.
2. Determinism + tests: boundary strategy; UTC `Date:`; optional injectable clock; golden tests.
3. Branding: `From:` line.
4. Small polish: encoding literals/constants; document QP heuristic.
5. Interop decision: CID + `cid:` rewriting vs Content-Location-only (largest item).
6. Optional: `Snapshot-Content-Location`; stream-unified API; reftest generator and test layout.

## 6. Review reply checklist

- Still valid on inspected tree: boundary, date, branding, `mFirstPart`, AddDocument/AddResource split, encoding literals, QP documentation, CID question, `OnStartRequest` dead code, comment accuracy, test layout and generator questions.
- Needs branch check: `MHTMLArchive.sys.mjs`, reftest generator presence.
- Blink export supports treating branding and CID/`cid:` as the main interop gaps to mention explicitly.
