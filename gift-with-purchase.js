/**
 * Shopify theme script: automatic gift-with-purchase
 * - Adds the gift variant when the cart subtotal is >= threshold.
 * - Removes the gift if the cart drops below the threshold.
 * - Keeps only one gift even if customers add/remove items repeatedly.
 *
 * Set GIFT_PRODUCT_HANDLE to the handle of your hidden tote product.
 * Shopify will fetch the product JSON and automatically pick its first variant.
 * Upload this file as an asset and include it on your cart page + mini-cart.
 */
(function () {
  const GIFT_PRODUCT_HANDLE = 'MT-GWP'; // Gift product handle configured for your store
  const THRESHOLD_CENTS = 15000; // $150.00 CAD in cents
  const GIFT_LINE_KEY_STORAGE = 'gwp:lastGiftKey';
  const REFRESH_INTERVAL_MS = 5000; // Safety poll to catch missed events

  let inflight = false;
  let resolvedVariantId = null;

  async function fetchJSON(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  }

  async function getGiftVariantId() {
    if (resolvedVariantId) return resolvedVariantId;

    if (!GIFT_PRODUCT_HANDLE) {
      throw new Error('[GWP] No gift product handle configured. Set GIFT_PRODUCT_HANDLE to your gift product handle.');
    }

    const product = await fetchJSON(`/products/${GIFT_PRODUCT_HANDLE}.js`);
    const firstVariant = product?.variants?.[0];
    if (firstVariant?.id) {
      resolvedVariantId = Number(firstVariant.id);
      return resolvedVariantId;
    }

    throw new Error(
      '[GWP] Could not find a variant for the provided product handle. Ensure the product has a variant and is available to Online Store.',
    );
  }

  function findGiftLine(cart, variantId) {
    return cart.items.find((item) => item.id === variantId) || null;
  }

  async function addGift(variantId) {
    return fetchJSON('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: variantId, quantity: 1 }),
    });
  }

  async function removeGift(lineKey) {
    const updates = { [lineKey]: 0 };
    return fetchJSON('/cart/update.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
  }

  async function ensureGiftState() {
    if (inflight) return;
    inflight = true;
    try {
      const variantId = await getGiftVariantId();
      const cart = await fetchJSON('/cart.js');
      const giftLine = findGiftLine(cart, variantId);
      const hasGift = Boolean(giftLine);
      const meetsThreshold = cart.items_subtotal_price >= THRESHOLD_CENTS;

      if (meetsThreshold && !hasGift) {
        const addResp = await addGift(variantId);
        // Store the cart line key so we can remove the exact gift line later.
        if (addResp && addResp.key) {
          sessionStorage.setItem(GIFT_LINE_KEY_STORAGE, addResp.key);
        }
      } else if (!meetsThreshold && hasGift) {
        const lineKey = giftLine.key || sessionStorage.getItem(GIFT_LINE_KEY_STORAGE);
        if (lineKey) {
          await removeGift(lineKey);
          sessionStorage.removeItem(GIFT_LINE_KEY_STORAGE);
        }
      }
    } catch (err) {
      console.warn('[GWP] Gift check failed:', err);
    } finally {
      inflight = false;
    }
  }

  // Ensure the gift check runs before customers leave the cart by intercepting checkout
  // buttons/links. This reduces the chance that a fast click on "Checkout" skips the
  // add/remove logic when the mini-cart doesn't emit events.
  function bindCheckoutInterceptors() {
    const candidates = [
      'form[action="/cart"] [name="checkout"]',
      'form[action="/checkout"] [type="submit"]',
      'button[name="checkout"]',
      'a[href*="/checkout"]',
    ];

    const elements = document.querySelectorAll(candidates.join(','));
    elements.forEach((el) => {
      if (el.dataset.gwpCheckoutBound === 'true') return;
      el.dataset.gwpCheckoutBound = 'true';

      el.addEventListener('click', async (evt) => {
        // Only intercept primary clicks/enter submits.
        if (evt.defaultPrevented || (evt.type === 'click' && evt.button !== 0)) return;
        evt.preventDefault();
        evt.stopPropagation();

        try {
          await ensureGiftState();
        } finally {
          // After syncing the gift, continue to checkout using the original intent.
          const target = evt.currentTarget;
          if (target.tagName === 'A' && target.href) {
            window.location.href = target.href;
          } else if (target.form) {
            target.form.submit();
          } else {
            window.location.href = '/checkout';
          }
        }
      });
    });
  }

  // Hook into common cart change triggers. You can also call window.gwpEnsureGift() manually
  // after your theme finishes an AJAX cart update.
  document.addEventListener('cart:refresh', ensureGiftState);
  document.addEventListener('cart:updated', ensureGiftState);
  document.addEventListener('ajaxProduct:added', ensureGiftState);
  document.addEventListener('change', (evt) => {
    if (evt.target && evt.target.closest('form[action^="/cart"]')) {
      setTimeout(ensureGiftState, 300);
    }
  });

  // Run on load to cover direct cart visits and poll as a safety net in case the theme
  // doesn't emit expected events.
  ensureGiftState();
  window.addEventListener('load', ensureGiftState);
  window.addEventListener('load', bindCheckoutInterceptors);
  setInterval(ensureGiftState, REFRESH_INTERVAL_MS);
  // Re-bind checkout interceptors periodically in case the theme re-renders checkout buttons
  // (common in AJAX mini-carts/drawers).
  setInterval(bindCheckoutInterceptors, REFRESH_INTERVAL_MS);
  window.gwpEnsureGift = ensureGiftState; // Expose for manual calls if your theme emits different events.

  // Debug helper: run window.gwpDebugStatus() from the console to see current state and a one-off check
  // without changing the cart.
  window.gwpDebugStatus = async function gwpDebugStatus() {
    console.info('[GWP] Debug: starting status check...');
    console.info('[GWP] Configured product handle:', GIFT_PRODUCT_HANDLE || '(none)');
    console.info('[GWP] Threshold (cents):', THRESHOLD_CENTS);

    try {
      const variantId = await getGiftVariantId();
      const cart = await fetchJSON('/cart.js');
      const giftLine = findGiftLine(cart, variantId);
      const meetsThreshold = cart.items_subtotal_price >= THRESHOLD_CENTS;
      const storedKey = sessionStorage.getItem(GIFT_LINE_KEY_STORAGE);

      console.info('[GWP] Resolved variant ID in use:', variantId);
      console.info('[GWP] Cart subtotal (cents):', cart.items_subtotal_price, 'Meets threshold?', meetsThreshold);
      console.info('[GWP] Gift present in cart?', Boolean(giftLine), giftLine ? `line key: ${giftLine.key}` : '');
      console.info('[GWP] Stored line key:', storedKey || '(none)');

      // Perform a dry-run ensure (no mutation if state already matches)
      await ensureGiftState();
      console.info('[GWP] Debug run complete. If the gift still does not appear, confirm the product handle is correct and that the gift is available to the Online Store channel.');
    } catch (err) {
      console.warn('[GWP] Debug failed:', err);
    }
  };
})();
