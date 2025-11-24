# Gift card checker

This repository contains a ready-to-drop Shopify theme script that automatically adds a hidden tote (or any gift variant) to a shopper's cart once their subtotal reaches $150 CAD, and removes it if the subtotal falls below the threshold.

## Quick start (Shopify theme integration)
1. **Create the free gift product** in Shopify and note its **product handle** (the `.../products/<handle>` part of the URL).
   - Shopify always creates a default variant even when the product appears to have “no variants.” The script will automatically pick the first variant for you using the handle.
2. In your theme, go to **Edit code → Assets → Add a new asset → Upload** and upload `gift-with-purchase.js`.
3. Open the uploaded asset and **confirm `GIFT_PRODUCT_HANDLE`** matches your gift product handle. It is currently set to `MT-GWP` for your store; adjust it if your handle differs. If your threshold is not `$150 CAD`, adjust `THRESHOLD_CENTS` (e.g., `$120.00` → `12000`).
4. Include the script wherever your cart updates occur (cart page and mini-cart).
   - If you have `templates/cart.liquid`, add this near the bottom of that file:
     ```liquid
     {{ 'gift-with-purchase.js' | asset_url | script_tag }}
     ```
- If you don’t have `cart.liquid` and only see `templates/cart.json` (common in Online Store 2.0):
     1) Open `cart.json` and note the section handles listed (e.g., `"main-cart-items"`, `"main-cart-footer"`).
     2) Open those matching **Sections** files (e.g., `sections/main-cart-items.liquid`, `sections/main-cart-footer.liquid`).
     3) Paste the same script tag near the bottom of one of those cart sections so it loads on the cart page.
        - If the section has a `{% schema %} ... {% endschema %}` block, place the script **outside** that JSON block (before `{% schema %}` or after `{% endschema %}`); do not paste inside the schema JSON itself.
   - For a mini-cart/drawer, open the section that renders it (often `sections/cart-drawer.liquid`, `sections/header.liquid`, or similar) and add the same script tag there so it loads when the drawer opens.
   - Place the tag near your other scripts; the exact spot doesn’t matter as long as it’s inside the template/section that renders the cart or mini-cart. After any custom AJAX cart change, call `window.gwpEnsureGift()` so the gift check runs immediately.
   - **Do not change `asset_url` or `script_tag`.** Those are Liquid filters that convert the asset into a proper script tag. Only change the filename (`'gift-with-purchase.js'`) if you renamed the uploaded file.
5. **Double-check the handle**: confirm `GIFT_PRODUCT_HANDLE` matches the gift product’s handle (the part after `/products/` in its URL). The script will fetch `/products/<handle>.js` and automatically use the first variant returned.
6. **Keep the gift hidden from shoppers**: make it available to the **Online Store channel** (required so Shopify can add it) but remove it from navigation, collections, and search.
6. Test end-to-end in an **incognito browser**: add products to reach `$150 CAD`, confirm the tote appears as a $0 line item, then remove items to drop below `$150` and verify the gift is removed.
7. If the gift still does not appear, use the built-in debug helper `window.gwpDebugStatus()` from your browser console (on the cart page/drawer). It will print whether the cart meets the threshold, whether the handle resolved to a variant, and any add/remove errors.

## ELI5: how to plug this into your store
Think of the script as a little helper that watches your cart and drops a free tote in when the cart has enough money in it. Here’s how to make the helper work:

1. **Give the helper the tote’s handle**
   - In Shopify admin, open the tote product and copy the **handle** (the text after `/products/` in the URL).
   - Open `gift-with-purchase.js` and replace `GIFT_PRODUCT_HANDLE` with that handle. Leave the rest alone unless you want a different spend amount.
2. **Tell the helper the spend amount (if not $150)**
   - In the same file, change `THRESHOLD_CENTS` if you want a different minimum. Example: `$120.00` becomes `12000`.
3. **Put the helper in your theme**
   - In Shopify admin: **Online Store → Themes → ... → Edit code → Assets → Add a new asset → Upload** and upload `gift-with-purchase.js`.
4. **Wake the helper up on cart pages**
   - In your cart page template (often `cart.liquid`) add: `{{ 'gift-with-purchase.js' | asset_url | script_tag }}`.
   - If you use a mini-cart/drawer, add the same line wherever that mini-cart is rendered (commonly `theme.liquid`, `header.liquid`, or a `header`/`cart-drawer` section). This makes sure the helper runs when the mini-cart opens.
5. **Tell the helper when the cart changes**
   - "Custom AJAX cart change" means any JavaScript in your theme that calls Shopify's cart endpoints (e.g., `/cart/add.js`, `/cart/update.js`, `/cart/change.js`) without reloading the page. After each of those requests finishes, call `window.gwpEnsureGift();` once so the helper can re-check the cart.
   - Example: **call it right after your own fetch promise resolves** (you do not paste this everywhere the script tag lives; put it next to the JS that updates the cart):
     ```js
     fetch('/cart/add.js', { method: 'POST', body: formData })
       .then((r) => r.json())
       .then(() => window.gwpEnsureGift());
     ```
   - If you don’t write custom JS, you can still finish this step by listening for your theme’s events once on page load. Add this near where you include the script (e.g., in the same template or a small snippet):
     ```liquid
     <script>
       document.addEventListener('cart:updated', window.gwpEnsureGift);
       document.addEventListener('ajaxProduct:added', window.gwpEnsureGift);
     </script>
     ```
   - If your theme fires an event like `cart:updated` or `ajaxProduct:added`, also add `document.addEventListener('cart:updated', window.gwpEnsureGift);` once on page load. The helper already listens for those events, so adding the listeners once is enough.
6. **Keep the tote hidden**
   - Make the tote **available to Online Store** (so Shopify can add it), but don’t link it anywhere: remove it from navigation, collections, and search, and leave it unpublished from other channels.
7. **Test like a shopper**
   - In an incognito window, add items until the subtotal hits your threshold. The tote should appear as a free line. Remove items so you’re below the threshold and the tote should vanish.

## How it works
- The script polls the cart via Shopify's AJAX API (`/cart.js`).
- When the cart subtotal is **≥ $150 CAD**, it adds the gift variant via `/cart/add.js` and stores the returned `line item key` in `sessionStorage`.
- If the subtotal drops **below $150**, it removes that line item via `/cart/update.js`.
- It listens for common cart change events (`cart:refresh`, form changes) and also runs once on page load. You can manually trigger a re-check with `window.gwpEnsureGift()` after any custom AJAX cart update.

### Where to find the cart template (cart.liquid vs cart.json vs cart.js)
- **`cart.liquid` and `cart.json` are the templates; `cart.js` is not.** If you only see `cart.js`, that is just a JS asset and not where you paste the Liquid script tag.
- If you don’t see `cart.liquid`, open **Templates → cart.json** (common in Online Store 2.0). Inside that JSON file, note the section handles listed (e.g., `"main-cart-items"`, `"main-cart-footer"`). Open those **Sections** files (e.g., `sections/main-cart-items.liquid`) and drop the script tag there so it loads with the cart markup.
- For mini-carts/drawers, look under **Sections** for files named `cart-drawer.liquid`, `cart-popup.liquid`, or similar, and add the script tag (plus the `window.gwpEnsureGift()` hook) where that drawer’s markup/scripts live.

### What is an “AJAX cart update”?
- **Plain-English version:** when your theme changes the cart in the background without reloading the page—like a mini-cart “add to cart” button, a quantity stepper in a drawer, or a remove button that updates instantly.
- **Developer version:** any JS call that hits Shopify’s AJAX endpoints such as `/cart/add.js`, `/cart/update.js`, or `/cart/change.js` and then updates the cart UI. Because the page doesn’t reload, you need to poke the helper so it knows the cart changed.

### How to call `window.gwpEnsureGift()` manually
Add this right after your theme finishes any custom cart request. It doesn’t matter where in the file as long as it runs after the AJAX call resolves and only executes once per cart change.

```js
// After your custom /cart/add.js call
fetch('/cart/add.js', { method: 'POST', body: formData })
  .then((r) => r.json())
  .then(() => {
    // Update your mini-cart UI here if needed
    window.gwpEnsureGift();
  });

// After a quantity update via /cart/update.js
fetch('/cart/update.js', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ updates: { [lineKey]: newQty } }),
})
  .then((r) => r.json())
  .then(() => window.gwpEnsureGift());
```

### Where to hook the manual call
- **Cart page template (`cart.liquid`)**: place the script tag and the manual call near your existing AJAX cart code (often in a `<script>` tag at the bottom of the template or a linked asset). Run `window.gwpEnsureGift()` after your fetch promise resolves.
- **Mini-cart / cart drawer**: if your theme has a `cart-drawer` or `header` section with inline JS that adds/removes items, call `window.gwpEnsureGift()` in that same JS block after the cart request completes.
- **Theme events**: if your theme emits events like `cart:updated`, you can hook once on page load instead of sprinkling calls everywhere:
  ```js
  document.addEventListener('cart:updated', window.gwpEnsureGift);
  ```
- **One call per change**: you don’t have to spam the helper—one call after the cart request resolves is enough, and the helper ignores duplicate inflight runs.

### Quick troubleshooting (gift not showing up)
- **Wrong handle**: verify the handle in `gift-with-purchase.js` matches the product URL (`.../products/<handle>`). The script will fetch `/products/<handle>.js` to resolve the first variant.
- **Not available on Online Store**: the gift product must be available to the Online Store channel (even if you hide it from navigation/collections/search). Otherwise Shopify blocks adding it.
- **Theme events never fire**: if your theme doesn’t dispatch `cart:updated`/`ajaxProduct:added`, add a manual call after your AJAX cart code as shown above.
- **Inventory**: ensure the gift variant is in stock, or allow “continue selling when out of stock.”
- **Debug helper**: open your cart page/drawer, open DevTools Console, and run:
  ```js
  window.gwpDebugStatus();
  ```
  You’ll see:
  - the configured product handle and resolved variant ID
  - the current cart subtotal and whether it meets the threshold
  - whether the gift is already in the cart and the stored line item key
  - the result of a simulated gift check (including any add/remove errors)

## Notes and limits
- Works with one gift variant; if you need multiple gift options, extend the script to map thresholds to product handles/variant IDs.
- Requires the gift variant to be available to the Online Store sales channel so Shopify can add it, but you can keep it unlinked from navigation/collections.
- Inventory is respected: if the gift is out of stock and you do **not** allow backorders, Shopify will refuse the add request.
- No discounts are used; the gift line will be a $0 product. If you prefer a discounted price instead of free, set a non-zero price on the product and leave the rest of the script unchanged.
