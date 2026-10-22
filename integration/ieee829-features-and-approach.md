# Level Test Plan extract (IEEE 829-2008)

**Project:** E-Commerce Platform for Selling and Promoting Handmade Products  
**Requirements source:** SRS version 1.0, approved 08.10.2026 (IEEE 830-1998)  
**Test level:** system test of the buyer journey on the local stack  
**Scope of this extract:** Features to be tested, Features not to be tested, Approach

This run covers a small part of SRS section 4.1. It is not a full test of the SRS.

## Features to be tested

Each feature is checked once, through the buyer web client, against the cited requirements. A feature passes when those checks succeed. Internal page models and upstream URLs are not inspected.

| ID | Feature | SRS | What is checked |
| --- | --- | --- | --- |
| FT-01 | Home publications and recommendations | 4.1.2, REQ-4.1.2-04, REQ-4.1.2-06, REQ-4.1.2-07 | The home page shows a publication section. For a signed-in buyer it shows a recommendation list. For an anonymous visitor the personal recommendation section is empty. |
| FT-02 | Publication feed and publication page | 4.1.4, REQ-4.1.4-02, REQ-4.1.4-03, REQ-4.1.4-04, REQ-4.1.4-05 | A feed card shows the title and the summary, not the full text. The publication page shows the content. An unknown publication id returns not found. |
| FT-03 | Product search | 4.1.3, REQ-4.1.3-01, REQ-4.1.3-03 | A text query returns product cards. A query that matches nothing returns an empty result, not an error page. |
| FT-04 | Product page | 4.1.5, REQ-4.1.5-01, REQ-4.1.5-02, REQ-4.1.5-03 | The page shows the title, description, price, image, and the master. An unknown product id returns not found, not an empty page. |
| FT-05 | Master profile | 4.1.5, REQ-4.1.5-07 | The master page lists that master’s products and publications. |
| FT-06 | Shopping cart | 4.1.7, 4.1.10, REQ-4.1.7-04, REQ-4.1.7-05, REQ-4.1.10-02 | Cart, quantity change, and line removal require a signed-in buyer. Removing one line, or changing its quantity, does not change the other line. |
| FT-07 | Pickup checkout and order history | 4.1.8, 4.3, REQ-4.1.8-03, REQ-4.1.8-08, REQ-4.1.8-10, REQ-4.3-01 | A signed-in buyer can place one pickup order. Payment may be the MVP stub: the order is created and then appears in the buyer’s order list. A real Safe Deal is not required. |

FT-06 and FT-07 use a buyer session prepared in the test environment. How that session was created is not part of the feature.

## Features not to be tested

| ID | Feature or combination | SRS | Reason |
| --- | --- | --- | --- |
| NT-01 | Login and registration | B2C-10, B2C-11 | The SRS delegates both to Yandex ID and does not specify an email and password form. The Yandex ID service is not available for this run, so authentication itself is not tested. |
| NT-02 | Seller workspace | 4.2.1–4.2.10 | Specified for the seller. This run is limited to the buyer journey in section 4.1. |
| NT-03 | Safe Deal after payment | 4.3, from REQ-4.3-02 onward, except the buyer-visible order in FT-07 | REQ-4.1.8-10 allows payment to be stubbed for the MVP. Deal creation, payout, cancellation, and refund are not run against YooKassa. |
| NT-04 | Seller fulfillment | REQ-4.3-04–REQ-4.3-09, 4.2.8 | Stock confirmation, the pickup code, and payout are seller actions. They are outside this buyer run. |
| NT-05 | CDEK | 2.4, 4.2.9 | The SRS limits carrier integration to CDEK, and the seller-side configuration is still TBD. No shipment is created. |
| NT-06 | Subscriptions to masters | 4.1.6 | Specified, and left out for time. |
| NT-07 | Behavioral events | 4.1.9, REQ-4.1.8-11 | Views, search, cart, purchase, and subscribe events, and any effect on later recommendations, are not sent or checked. |
| NT-08 | Other home sections | REQ-4.1.2-02, REQ-4.1.2-03, REQ-4.1.2-05, REQ-4.1.2-09 | Popular masters, new arrivals, categories, and the home title are not checked. FT-01 covers publications and recommendations only. |
| NT-09 | Search facets and search failure | REQ-4.1.3-02, REQ-4.1.3-06 | Facet counts and the “search unavailable” state are not provoked. |
| NT-10 | Degraded sections | REQ-4.1.2-08, REQ-4.1.4-06, 4.1.11 | A downed Gorse, goods, or search service is not provoked. Timeouts and retries are not measured. |
| NT-11 | Non-functional requirements | 4.1.12, section 5 | Performance, safety, security, and the OpenAPI latency target are out of this run. One desktop browser is used. |
| NT-12 | Administrators and moderators | 1.1, TBD-2 | Deferred by the SRS to a separate specification. |

## Approach

**Level and style.** System test of release 1.0 as specified in the SRS. The test item is the buyer web client on the local stack. The buyer-visible scenarios are manual. The existing unit tests are run first. No new automated suite is written for this run.

**Activities.** One tester runs each feature once.

1. Start the local stack, including the storefront, the buyer API, catalogue, publications, and search. Leave the payment stub enabled, as allowed by REQ-4.1.8-10.
2. Prepare one signed-in buyer and one master who already has a product and a publication. Do not create that session through Yandex ID.
3. Walk the scenario in the browser: open the page, submit the action, and read the next page.
4. Compare the screen with the requirement cited for that feature. For FT-02 and FT-04, also request the unknown id and confirm not found.
5. Fail the feature if the required content is missing, the wrong page is shown, or a cited error is not returned. Behavior that the SRS does not require for that feature does not fail it.
6. If the stack or the payment stub is down, suspend that scenario and resume it when the service is back. Do not replace the stub with a live YooKassa shop.

**Unit tests.** Before the manual scenarios, run the existing pytest unit suite in `ecom-platform-B2C/tests/unit` once. It covers cart totals, the publication cursor and post mapping, the search-document price, order status transitions, and which events count as recommendation feedback. Run the order-service unit tests in `sem-ecom-platform/services/orders_service/test` as well. They mock the payment provider and do not replace the stubbed checkout in FT-07. The storefront has no unit tests. If a unit test that supports FT-02, FT-03, FT-06, or FT-07 fails, suspend that feature until the failure is understood. A passing unit suite does not pass the feature.

**Tools.** One desktop browser, pytest for the suites above, and the local compose stack.

**Coverage.** Each feature has one positive path. FT-01 also compares the signed-in and anonymous recommendation sections. FT-02 and FT-04 include the not-found case. FT-06 uses two cart lines. No other combinations are required.

**Constraints.** Time limits the run to FT-01–FT-07. Results apply to this local stack only.

**Traceability.** FT-01–FT-07 trace to the SRS identifiers in the table above.
