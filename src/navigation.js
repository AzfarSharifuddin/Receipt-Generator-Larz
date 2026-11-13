'use strict';
// Move the existing navigation, including its CSRF-protected sign-out form.
// No duplicate page controls, badges or form state are created for mobile.
const navigationSidebar=document.querySelector('.sidebar'),navigationDialog=$('#mobile-navigation'),navigationMenu=$('#mobile-menu-button'),navigationClose=$('#mobile-navigation-close');
const navigationMedia=window.matchMedia('(max-width:650px)'),navigationHome=document.createComment('desktop navigation');
navigationSidebar.before(navigationHome);
let navigationFocus='menu';
function updateNavigationPage(page){navigationSidebar.querySelectorAll('[data-page]').forEach(button=>{if(button.dataset.page===page)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')})}
function lockNavigationScroll(locked){document.documentElement.classList.toggle('mobile-menu-open',locked);document.body.classList.toggle('mobile-menu-open',locked)}
function closeMobileNavigation(focus='menu'){
 navigationFocus=focus;
 if(navigationDialog.open)navigationDialog.close();
 navigationMenu.setAttribute('aria-expanded','false');lockNavigationScroll(false);
}
function openMobileNavigation(){
 if(!navigationMedia.matches||navigationDialog.open)return;
 navigationFocus='menu';navigationDialog.showModal();navigationMenu.setAttribute('aria-expanded','true');lockNavigationScroll(true);navigationClose.focus();
}
function syncNavigationLayout(){
 closeMobileNavigation('none');
 if(navigationMedia.matches)navigationDialog.append(navigationSidebar);else navigationHome.after(navigationSidebar);
}
navigationMenu.onclick=openMobileNavigation;navigationClose.onclick=()=>closeMobileNavigation();
navigationDialog.addEventListener('close',()=>{
 if(navigationDialog.open)return;
 navigationMenu.setAttribute('aria-expanded','false');lockNavigationScroll(false);
 if(navigationFocus==='page'){$('#page-title').tabIndex=-1;$('#page-title').focus({preventScroll:true})}
 else if(navigationFocus==='menu'&&navigationMedia.matches)navigationMenu.focus({preventScroll:true});
 navigationFocus='menu';
});
navigationDialog.addEventListener('cancel',event=>{event.preventDefault();closeMobileNavigation()});
navigationDialog.addEventListener('click',event=>{
 if(event.target!==navigationDialog)return;
 const rect=navigationDialog.getBoundingClientRect();
 if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeMobileNavigation();
});
navigationSidebar.addEventListener('click',event=>{
 const button=event.target.closest('[data-page]');if(!button||!navigationMedia.matches)return;
 event.preventDefault();event.stopImmediatePropagation();
 // Returning to the editor keeps this tab's unfinished entry. New document is explicit.
 show(button.dataset.page);closeMobileNavigation('page');window.scrollTo({top:0,behavior:'auto'});
},true);
const showBeforeCompactNavigation=show;
show=function(page){showBeforeCompactNavigation(page);updateNavigationPage(page)};
navigationMedia.addEventListener('change',syncNavigationLayout);
syncNavigationLayout();updateNavigationPage(document.querySelector('.page:not([hidden])')?.id||'editor');document.body.classList.add('mobile-navigation-ready');
