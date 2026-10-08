import { H_PATH, TILE_RADIUS } from '@/lib/brand'

/**
 * Cold-start intro for the installed app (home-screen icon), like the Android app's: its first frame is the
 * iOS launch image exactly (page colour + the H tile at 88 px, centred, following the *system* appearance as
 * iOS does), then the tile settles with a sheen and the overlay lifts away to the app. ≤ 560 ms in total.
 *
 * It is server-rendered so it covers the very first paint (no flash of the app before it), but stays
 * `display: none` unless `display-mode: standalone`; the inline script below arms it once per app launch
 * (sessionStorage) and hides it afterwards. Regular browser tabs never see it. Reduced motion: a short fade.
 *
 * The same inline script also catches Chromium's early `beforeinstallprompt` before React is running.
 */
const ARM = `(function(){
window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__hisabInstallPrompt=e});
var el=document.getElementById('launch-intro');if(!el)return;
var standalone=false;try{standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}catch(e){}
var seen=false;try{seen=sessionStorage.getItem('hisab:launched')==='1';sessionStorage.setItem('hisab:launched','1')}catch(e){}
if(!standalone||seen){el.setAttribute('hidden','');return}
el.setAttribute('data-run','');
var done=function(){el.setAttribute('hidden','');el.removeAttribute('data-run')};
el.addEventListener('animationend',function(e){if(e.target===el)done()});
setTimeout(done,1200);
})()`

export function LaunchIntro() {
  return (
    <>
      <div id="launch-intro" className="launch-intro" aria-hidden suppressHydrationWarning>
        <div className="launch-tile">
          <svg viewBox="0 0 100 100" width="88" height="88">
            <defs>
              <linearGradient id="launch-hl" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fff" className="launch-hl" />
                <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
              <clipPath id="launch-clip">
                <rect width="100" height="100" rx={TILE_RADIUS} />
              </clipPath>
            </defs>
            <rect width="100" height="100" rx={TILE_RADIUS} className="launch-tile-bg" />
            <rect width="100" height="100" rx={TILE_RADIUS} fill="url(#launch-hl)" />
            <g clipPath="url(#launch-clip)">
              <g className="launch-sheen">
                <rect x="-70" y="-30" width="36" height="160" transform="rotate(18 50 50)" />
              </g>
            </g>
            <path d={H_PATH} className="launch-glyph" />
          </svg>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: ARM }} />
    </>
  )
}
