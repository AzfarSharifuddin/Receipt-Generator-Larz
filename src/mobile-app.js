'use strict';
// Presentation rules are also exported for regression tests without a browser.
function useMobileApp(standalone, width) { return !!standalone && width <= 1000; }
function mobileKeyboardOpen(editing, baseline, height, scale = 1) {
 return !!editing && scale === 1 && baseline - height > 120;
}
if (typeof module === 'object' && module.exports) {
 module.exports = {useMobileApp, mobileKeyboardOpen};
} else (() => {
 const displayMode = window.matchMedia('(display-mode: standalone)');
 // Ordinary browser tabs do not install listeners, controls or navigation wrappers.
 if (!displayMode.matches && navigator.standalone !== true) return;
 const compact = window.matchMedia('(max-width:1000px)');
 const tabs = document.createElement('nav');
 tabs.id = 'mobile-app-tabs';
 tabs.setAttribute('aria-label', 'Main navigation');
 const paths = {
  editor: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  orders: '<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h6"/>',
  inventory: '<path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
 };
 tabs.innerHTML = [['editor','Create'],['orders','Orders'],['inventory','Inventory'],['more','More']].map(([page,label]) => `<button type="button" data-mobile-page="${page}"${page === 'more' ? ' aria-haspopup="dialog" aria-controls="mobile-navigation" aria-expanded="false"' : ''}><span class="mobile-tab-icon"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[page]}</svg>${page === 'orders' ? '<span class="mobile-orders-count" hidden></span>' : ''}</span><span>${label}</span></button>`).join('');
 document.body.append(tabs);
 const more = tabs.querySelector('[data-mobile-page="more"]');
 const badge = tabs.querySelector('.mobile-orders-count');
 const heading = $('#mobile-navigation-title');
 let enabled = false, returnToMore = false;
 let baseline = window.visualViewport?.height || window.innerHeight;
 let viewportWidth = window.innerWidth;
 const currentPage = () => document.querySelector('.page:not([hidden])')?.id || 'editor';
 function updateTabs(page = currentPage()) {
  tabs.querySelectorAll('button').forEach(button => {
   const active = button.dataset.mobilePage === (['editor','orders','inventory'].includes(page) ? page : 'more');
   button.classList.toggle('active', active);
   if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  more.setAttribute('aria-expanded', String(navigationDialog.open));
 }
 const beforeShow = show;
 show = function(page) { beforeShow(page); if (enabled) updateTabs(page); };
 const beforeClose = closeMobileNavigation;
 closeMobileNavigation = function(focus = 'menu') {
  returnToMore = enabled && focus === 'menu';
  beforeClose(enabled && focus === 'menu' ? 'none' : focus);
  if (enabled) updateTabs();
 };
 navigationDialog.addEventListener('close', () => {
  if (navigationDialog.open || !enabled) return;
  updateTabs();
  if (returnToMore) more.focus({preventScroll:true});
  returnToMore = false;
 });
 tabs.addEventListener('click', event => {
  const button = event.target.closest('[data-mobile-page]');
  if (!button || !enabled) return;
  if (button === more) {
   if (navigationDialog.open) return;
   returnToMore = true; navigationFocus = 'none';
   navigationDialog.showModal(); lockNavigationScroll(true);
   updateTabs(); navigationClose.focus();
  } else {
   // Do not call startNewDocument: switching tabs preserves the current entry.
   show(button.dataset.mobilePage);
   $('#page-title').tabIndex = -1; $('#page-title').focus({preventScroll:true});
   window.scrollTo({top:0, behavior:'auto'});
  }
 });
 // The existing drawer handles portrait; this covers standalone phone landscape.
 navigationSidebar.addEventListener('click', event => {
  const button = event.target.closest('[data-page]');
  if (!enabled || navigationMedia.matches || !button) return;
  event.preventDefault(); event.stopImmediatePropagation();
  show(button.dataset.page); closeMobileNavigation('page');
  window.scrollTo({top:0, behavior:'auto'});
 }, true);
 function syncBadge() {
  const original = $('#orders-badge');
  const count = Number(original.textContent) || 0;
  badge.hidden = original.hidden || count < 1;
  badge.textContent = count > 99 ? '99+' : String(count);
  tabs.querySelector('[data-mobile-page="orders"]').setAttribute('aria-label', badge.hidden ? 'Orders' : `Orders, ${count} pending`);
 }
 new MutationObserver(syncBadge).observe($('#orders-badge'), {attributes:true, attributeFilter:['hidden'], childList:true, subtree:true, characterData:true});
 syncBadge();
 function syncKeyboard() {
  if (!enabled) return;
  const viewport = window.visualViewport;
  const height = viewport?.height || window.innerHeight;
  if (window.innerWidth !== viewportWidth) {
   viewportWidth = window.innerWidth; baseline = Math.max(window.innerHeight, height);
  }
  baseline = Math.max(baseline, height);
  const field = document.activeElement;
  const editing = field?.matches('textarea, input:not([readonly]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"])');
  document.body.classList.toggle('mobile-app-keyboard', mobileKeyboardOpen(editing, baseline, height, viewport?.scale || 1));
 }
 function syncMode() {
  enabled = useMobileApp(displayMode.matches || navigator.standalone === true, compact.matches ? window.innerWidth : 1001);
  closeMobileNavigation('none');
  document.body.classList.toggle('mobile-app-ui', enabled);
  document.documentElement.classList.toggle('mobile-app-ui', enabled);
  heading.textContent = enabled ? 'More' : 'Pages';
  navigationClose.setAttribute('aria-label', enabled ? 'Close More' : 'Close navigation');
  if (enabled) { navigationDialog.append(navigationSidebar); updateTabs(); syncKeyboard(); }
  else { document.body.classList.remove('mobile-app-keyboard'); syncNavigationLayout(); }
 }
 compact.addEventListener('change', syncMode);
 navigationMedia.addEventListener('change', syncMode);
 displayMode.addEventListener('change', syncMode);
 window.visualViewport?.addEventListener('resize', syncKeyboard);
 window.addEventListener('resize', syncKeyboard);
 document.addEventListener('focusin', syncKeyboard);
 document.addEventListener('focusout', () => requestAnimationFrame(syncKeyboard));
 syncMode();
})();
