import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from "@/i18n/config";

/** Shared by the server root layout (inline script) and the client theme hook. */
export const THEME_STORAGE_KEY = "gymflow-theme";

/**
 * Runs in <head> before first paint so the page never flashes the wrong theme
 * or announces the wrong language (see Next.js "Preventing flash before hydration").
 */
export const themeInitScript = `(function(){var r=document.documentElement;try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");var d=p==="dark"||((!p||p==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}try{var l=localStorage.getItem("${LOCALE_STORAGE_KEY}");r.lang=l==="am"||l==="en"?l:"${DEFAULT_LOCALE}";}catch(e){}})();`;
