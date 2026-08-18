import {
  DEFAULT_THEME_PREFERENCE,
  LEGACY_THEME_STORAGE_KEY,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
} from "./config";

/**
 * Runs before first paint, inlined in <head>.
 *
 * The server already stamps data-theme from the cookie, so this only has real
 * work to do in two cases:
 *   1. preference is "system" — only the browser knows the OS setting;
 *   2. a visitor still has the old login-only localStorage key — migrate it to
 *      the cookie once so their choice survives.
 * Anything that throws (private mode, disabled storage) leaves the server's
 * value in place, which is a correct light-mode render.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{
var pref=null;
var m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=([^;]*)/);
if(m){pref=decodeURIComponent(m[1]);}
if(pref!=='light'&&pref!=='dark'&&pref!=='system'){
  var legacy=null;
  try{legacy=localStorage.getItem('${LEGACY_THEME_STORAGE_KEY}');}catch(e){}
  if(legacy==='light'||legacy==='dark'){
    pref=legacy;
    document.cookie='${THEME_COOKIE}='+legacy+'; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax';
    try{localStorage.removeItem('${LEGACY_THEME_STORAGE_KEY}');}catch(e){}
  }else{
    pref='${DEFAULT_THEME_PREFERENCE}';
  }
}
var resolved=pref;
if(pref==='system'){
  resolved=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
}
var root=document.documentElement;
root.setAttribute('data-theme',resolved);
root.setAttribute('data-theme-pref',pref);
}catch(e){}})();`;
