"use strict";(()=>{async function Y(e){try{if(typeof crypto>"u"||!crypto.subtle?.digest)throw new Error("crypto.subtle not available");let r=new TextEncoder().encode(e),n=await crypto.subtle.digest("SHA-256",r);return Array.from(new Uint8Array(n)).map(s=>s.toString(16).padStart(2,"0")).join("")}catch{return ke(e)}}function ke(e){let t=0;for(let r=0;r<e.length;r++){let n=e.charCodeAt(r);t=(t<<5)-t+n,t=t&t}return Math.abs(t).toString(16).padStart(8,"0")}var ye="[SubtitleFetcher]",Le=3e3,xe=100,Ie=["en","en-US","en-GB","en-AU"],Q={debug:0,info:1,warn:2,error:3},we="info";function d(e,...t){Q[e]>=Q[we]&&console[e==="error"?"error":e==="warn"?"warn":"log"](ye,`[${e.toUpperCase()}]`,...t)}function _(){let e=window.location.href,t=e.match(/\/course\/([^\/]+)\/learn\/lecture\/(\d+)/);if(!t)return d("debug","URL does not match Udemy course page pattern:",e),null;let r=t[1],n=t[2],s={courseId:ve()||"",courseSlug:r,lectureId:n,courseTitle:Se(),sectionTitle:Ee(),lectureTitle:$e()};return d("info","Extracted course info:",s),s}function ve(){try{if(typeof UD<"u"&&UD?.config?.brand?.course?.id)return String(UD.config.brand.course.id)}catch{}try{let t=performance.getEntriesByType("resource");for(let r of t){let n=r.name.match(/api-2\.0\/courses\/(\d+)/);if(n)return n[1]}}catch{}let e=document.querySelector("[data-course-id]");return e&&e.getAttribute("data-course-id")||""}function Se(){let e=['[data-purpose="course-header-title"]',".udlite-heading-xl",'h1[class*="course-title"]',"title"];for(let t of e){let r=document.querySelector(t);if(r?.textContent)return r.textContent.trim().replace(/\s*\|\s*Udemy\s*$/i,"")}}function Ee(){return document.querySelector('[data-purpose="section-heading"][aria-expanded="true"]')?.textContent?.trim()}function $e(){return document.querySelector('[data-purpose="curriculum-item-link"][aria-current="true"]')?.textContent?.trim()}async function Ve(){d("info","Starting video detection...");let e=Date.now();return new Promise(t=>{let r=()=>{let n=Ce(),o=Date.now()-e;if(n){d("info",`Video element found in ${o}ms`),t({found:!0,video:n,courseInfo:_(),timestamp:Date.now()});return}if(o>=Le){d("warn",`Video detection timeout after ${o}ms`),t({found:!1,video:null,courseInfo:_(),timestamp:Date.now()});return}setTimeout(r,xe)};r()})}function Ce(){let e=['video[data-purpose="video-player"]',"video.vjs-tech",".video-js video","video"];for(let t of e){let r=document.querySelector(t);if(r&&_e(r))return d("debug",`Found video with selector: ${t}`),r}return null}function _e(e){if(!e.src&&!e.querySelector("source"))return!1;let t=e.getBoundingClientRect();return!(t.width===0||t.height===0)}async function Ae(e,t){d("info","Extracting subtitle tracks...");let r={success:!1,tracks:[],method:"none"},n=Ue(e);if(n.length>0)return r.tracks=n,r.method="track-element",r.success=!0,d("info",`Found ${n.length} tracks from <track> elements`),r;let o=Re(e);if(o.length>0){if(o.filter(c=>c.url).length>0)return r.tracks=o,r.method="videojs-api",r.success=!0,d("info",`Found ${o.length} tracks from TextTrack API`),r;d("debug",`TextTrack API found ${o.length} tracks but none have URLs, trying network intercept`)}if(t?.lectureId){let i=await Oe(t);if(i.length>0)return r.tracks=i,r.method="udemy-api",r.success=!0,d("info",`Found ${i.length} tracks from Udemy captions API`),r}let s=await Fe();return s.length>0?(r.tracks=s,r.method="network-intercept",r.success=!0,d("info",`Found ${s.length} tracks from network intercept`),r):(d("warn","No subtitle tracks found"),r.error="No subtitle tracks available",r)}function Ue(e){let t=[];return e.querySelectorAll("track").forEach(n=>{n.src&&(n.kind==="subtitles"||n.kind==="captions")&&t.push({url:n.src,language:n.srclang||"unknown",label:n.label||n.srclang||"Unknown",isDefault:n.default,kind:n.kind})}),t}function Re(e){let t=[],r=e.textTracks;if(!r||r.length===0)return t;for(let n=0;n<r.length;n++){let o=r[n];(o.kind==="subtitles"||o.kind==="captions")&&t.push({url:"",language:o.language||"unknown",label:o.label||o.language||"Unknown",isDefault:o.mode==="showing",kind:o.kind})}return t}function H(e){let t=e.pathname.toLowerCase();return!!(t.includes("thumb-sprites")||t.includes("thumb_sprites")||t.includes("storyboard")||t.includes("thumbnail"))}function D(e){let t=e.trim().replace(/_/g,"-"),[r,n,...o]=t.split("-").filter(Boolean);if(!r)return t;if(!n)return r.toLowerCase();let s=o.length>0?`-${o.join("-")}`:"";return`${r.toLowerCase()}-${n.toUpperCase()}${s}`}function p(e){return typeof e=="string"&&e.trim()!==""?e.trim():typeof e=="number"&&Number.isFinite(e)?String(e):null}function ee(e){let t=e.match(/[_-]([a-z]{2}(?:-[A-Z]{2})?)[_.]/)||e.match(/lang[=_]([a-z]{2}(?:-[A-Z]{2})?)/i)||e.match(/locale[=_]([a-z]{2}(?:[_-][A-Z]{2})?)/i);return t?.[1]?D(t[1]):"unknown"}function Pe(e){try{return new URL(e).toString()}catch{return new URL(e,"https://www.udemy.com").toString()}}function Me(e){let t=new Set,r=[];for(let n of e){if(!n.url)continue;let o=Pe(n.url);t.has(o)||(t.add(o),r.push({...n,url:o}))}return r}function je(e){let t=[];for(let r of e){if(!r||typeof r!="object")continue;let n=r,o=p(n.url)||p(n.download_url)||p(n.downloadUrl)||p(n.vtt_url)||p(n.vttUrl)||p(n.file)||null;if(!o)continue;let s=N(o);if(s&&H(s)||s&&!O(s)||!s&&!o.includes(".vtt"))continue;let i=p(n.language)||p(n.locale)||p(n.srclang)||p(n.language_code)||p(n.lang)||null,c=i?D(i):ee(o),l=p(n.label)||p(n.display_title)||p(n.title)||(c.toLowerCase().startsWith("en")?"English":c||"Unknown"),u=typeof n.is_default=="boolean"&&n.is_default||typeof n.default=="boolean"&&n.default||c.toLowerCase()==="en";t.push({url:o,language:c,label:l,isDefault:u,kind:"subtitles"})}return t}function He(e,t=2e3){let r=[],n=new Set,o=[e],s=0;for(;o.length>0&&s<t;){let i=o.shift();if(!i||typeof i!="object"||n.has(i))continue;if(n.add(i),s++,Array.isArray(i)){for(let u of i)o.push(u);continue}let c=i,l=Object.keys(c);for(let u of l){let f=c[u];if(typeof f=="string"){let g=N(f);if(!g||H(g)||!O(g))continue;let y=p(c.language)||p(c.locale)||p(c.srclang)||p(c.language_code)||p(c.lang)||null,x=y?D(y):ee(f),be=x.toLowerCase().startsWith("en")?"English":x||"Unknown";r.push({url:f,language:x,label:be,isDefault:x.toLowerCase()==="en",kind:"subtitles"})}else f&&typeof f=="object"&&o.push(f)}}return r}function De(e){let t=[],r=e,n=[];Array.isArray(r?.asset?.captions)&&n.push(r.asset.captions),Array.isArray(r?.asset?.caption_tracks)&&n.push(r.asset.caption_tracks),Array.isArray(r?.captions)&&n.push(r.captions),Array.isArray(r?.results)&&n.push(r.results);for(let o of n)t.push(...je(o));return t.push(...He(e)),Me(t)}async function Ne(e){let t=await fetch(e,{credentials:"include"});if(!t.ok)throw new Error(`HTTP ${t.status} for ${e}`);return t.json()}async function Oe(e){let t=e.lectureId;if(!t)return[];let r=[`https://www.udemy.com/api-2.0/lectures/${encodeURIComponent(t)}/captions/`,`https://www.udemy.com/api-2.0/lectures/${encodeURIComponent(t)}/?fields[lecture]=asset&fields[asset]=captions`];e.courseId&&/^\d+$/.test(e.courseId)&&r.unshift(`https://www.udemy.com/api-2.0/users/me/subscribed-courses/${encodeURIComponent(e.courseId)}/lectures/${encodeURIComponent(t)}/?fields[lecture]=asset&fields[asset]=captions`);let n=null;for(let o of r)try{let s=await Ne(o),i=De(s);if(i.length>0)return i;n=new Error("No caption tracks found")}catch(s){n=s}return d("debug","Captions API lookup failed:",n),[]}async function Fe(){let e=[];try{let t=performance.getEntriesByType("resource");for(let n of t){let o=N(n.name);if(!o||H(o)||!O(o))continue;let s=n.name.match(/[_-]([a-z]{2}(?:-[A-Z]{2})?)[_.]/)||n.name.match(/lang[=_]([a-z]{2}(?:-[A-Z]{2})?)/i)||n.name.match(/locale[=_]([a-z]{2}(?:[_-][A-Z]{2})?)/i),i=s?s[1].replace(/_/g,"-"):"unknown";e.push({url:n.name,language:i,label:i.toLowerCase().startsWith("en")?"English":i==="unknown"?"Unknown":i,isDefault:i.toLowerCase()==="en",kind:"subtitles"})}return e.filter((n,o,s)=>o===s.findIndex(i=>i.url===n.url))}catch(t){return d("debug","Network intercept failed:",t),[]}}function N(e){try{return new URL(e)}catch{try{return new URL(e,"https://www.udemy.com")}catch{return null}}}function O(e){if(e.pathname.toLowerCase().includes(".vtt"))return!0;let r=["format","type","fmt","ext","extension","mime"];for(let n of r){let o=e.searchParams.get(n);if(!o)continue;let s=o.toLowerCase();if(s==="vtt"||s==="text/vtt"||s==="webvtt")return!0}return!1}function Be(e){let t=e.replace(/^\uFEFF/,"").slice(0,2e4).toLowerCase(),r=t.match(/#xywh=/g)?.length??0;return r===0?!1:r>=3?!0:t.includes("thumb-sprites")||t.includes("thumb_sprites")||t.includes("storyboard")||t.includes("thumbnail")}function Ge(e){if(e.length===0)return null;for(let n of Ie){let o=e.find(s=>s.language.toLowerCase()===n.toLowerCase());if(o)return d("info",`Selected track: ${o.label} (${o.language})`),o}let t=e.find(n=>n.language.toLowerCase().startsWith("en"));if(t)return d("info",`Selected English track: ${t.label}`),t;let r=e.find(n=>n.isDefault);return r?(d("info",`Selected default track: ${r.label}`),r):(d("info",`Selected first available track: ${e[0].label}`),e[0])}async function ze(e){if(d("info",`Fetching VTT from: ${e}`),!e)return{success:!1,error:"No URL provided"};try{let t;if(typeof chrome<"u"&&chrome.runtime?.sendMessage){let s=await chrome.runtime.sendMessage({type:"FETCH_VTT",payload:{url:e}});if(!s?.ok){let i=s?.error||"Failed to fetch VTT";return d("error",`VTT fetch failed: ${i}`),{success:!1,error:i}}t=s.content}else{let s=new AbortController,i=setTimeout(()=>s.abort(),1e4);try{let c=await fetch(e,{credentials:"include",signal:s.signal});if(!c.ok)return{success:!1,error:`HTTP ${c.status}: ${c.statusText}`};t=await c.text()}catch(c){let l=c instanceof Error?c.message:String(c);return{success:!1,error:l.toLowerCase().includes("aborted")?"Request timeout":l}}finally{clearTimeout(i)}}if(!qe(t))return d("error","Invalid VTT content received"),{success:!1,error:"Invalid VTT format"};let r=e.match(/[_-]([a-z]{2}(?:-[A-Z]{2})?)[_.]/)||e.match(/lang[=_]([a-z]{2}(?:-[A-Z]{2})?)/i),n=r?r[1]:"unknown",o=await Y(t);return d("info",`VTT fetched successfully: ${t.length} bytes, hash: ${o.substring(0,8)}...`),{success:!0,data:{content:t,url:e,language:n,hash:o}}}catch(t){let r=t instanceof Error?t.message:"Unknown error";return d("error",`VTT fetch error: ${r}`),{success:!1,error:r}}}function qe(e){return e.replace(/^\uFEFF/,"").trim().startsWith("WEBVTT")}async function te(){d("info","=== Starting subtitle fetch process ===");let e=await Ve();if(!e.found||!e.video)return d("warn","Video not found, aborting subtitle fetch"),{videoDetection:e,subtitleResult:{success:!1,tracks:[],method:"none",error:"Video element not found"},vttContent:null,selectedTrack:null};let t=await Ae(e.video,e.courseInfo);if(!t.success||t.tracks.length===0)return d("warn","No subtitle tracks found"),{videoDetection:e,subtitleResult:t,vttContent:null,selectedTrack:null};let r=t.tracks.filter(c=>c.url),n=Ge(r);if(!n||!n.url)return d("warn","No suitable track selected or track has no URL"),{videoDetection:e,subtitleResult:t,vttContent:null,selectedTrack:n};let o=[n,...r.filter(c=>c.url!==n.url)],s=null,i=null;for(let c of o){let l=await ze(c.url);if(l.success&&l.data){if(Be(l.data.content)){d("warn",`Detected thumbnail sprite VTT, skipping track: ${c.label} (${c.language})`);continue}s=c,i=l.data;break}d("warn",`Failed to fetch VTT for track ${c.label} (${c.language}): ${l.error||"unknown error"}`)}return d("info","=== Subtitle fetch process complete ==="),{videoDetection:e,subtitleResult:t,vttContent:i,selectedTrack:s}}var We="[WebVTT Generator]",Ke="WEBVTT",oe={includeCueIds:!0,includeStyles:!0,includeRegions:!0,includeNotes:!0,useShortTimestamp:!1},ne={debug:0,info:1,warn:2,error:3},Ze="warn";function Je(e,...t){ne[e]>=ne[Ze]&&console[e==="error"?"error":e==="warn"?"warn":"log"](We,`[${e.toUpperCase()}]`,...t)}function re(e,t=!1){let{hours:r,minutes:n,seconds:o,milliseconds:s}=e,i=n.toString().padStart(2,"0"),c=o.toString().padStart(2,"0"),l=s.toString().padStart(3,"0");return t&&r===0?`${i}:${c}.${l}`:`${r.toString().padStart(2,"0")}:${i}:${c}.${l}`}function Xe(e,t=oe){let r=[];e.id&&t.includeCueIds!==!1&&r.push(e.id);let n=re(e.startTime,t.useShortTimestamp),o=re(e.endTime,t.useShortTimestamp),s=`${n} --> ${o}`;return e.settings&&(s+=` ${e.settings}`),r.push(s),e.text&&r.push(e.text),r.join(`
`)}function Ye(e,t={}){let r={...oe,...t},n=[],o=Ke;if(e.header&&(o+=` ${e.header}`),n.push(o),n.push(""),r.includeStyles&&e.styles&&e.styles.length>0)for(let s of e.styles)n.push("STYLE"),n.push(s),n.push("");if(r.includeRegions&&e.regions&&e.regions.length>0)for(let s of e.regions)n.push("REGION"),n.push(s.settings),n.push("");if(r.includeNotes&&e.notes&&e.notes.length>0)for(let s of e.notes)n.push(`NOTE ${s}`),n.push("");for(let s=0;s<e.cues.length;s++){let i=e.cues[s];n.push(Xe(i,r)),s<e.cues.length-1&&n.push("")}return Je("info",`Generated WebVTT with ${e.cues.length} cues`),n.join(`
`)}function se(e){let t=typeof e=="string"?e:Ye(e);return`data:text/vtt;base64,${typeof btoa=="function"?btoa(unescape(encodeURIComponent(t))):Buffer.from(t,"utf-8").toString("base64")}`}var Qe="[TrackInjector]",et="\u4E2D\u6587\uFF08\u4F18\u5316\uFF09",tt="zh-CN",nt="data-udemy-caption-plus",rt="udemycaptionplus:trackinjected",ot="udemycaptionplus:trackactivated",ie={debug:0,info:1,warn:2,error:3},st="info";function m(e,...t){ie[e]>=ie[st]&&console[e==="error"?"error":e==="warn"?"warn":"log"](Qe,`[${e.toUpperCase()}]`,...t)}var v=new WeakMap,F=new WeakMap;function S(e){return v.get(e)||[]}function it(e,t){let r=v.get(e)||[];r.push(t),v.set(e,r)}function ct(e,t){let r=v.get(e)||[],n=r.findIndex(o=>o.element===t);n!==-1&&(r.splice(n,1),v.set(e,r))}function B(e,t,r={}){let{label:n=et,language:o=tt,kind:s="subtitles",activate:i=!0,exclusive:c=!0}=r;if(m("info",`Injecting track: "${n}" (${o})`),!e||!(e instanceof HTMLVideoElement))return m("error","Invalid video element"),{success:!1,error:"Invalid video element",method:"data-uri"};let u=S(e).find(f=>f.label===n);u&&(m("info",`Track "${n}" already exists, updating...`),ae(e,u.element));try{let f=se(t),g=document.createElement("track");g.kind=s,g.label=n,g.srclang=o,g.src=f,g.setAttribute(nt,"true"),e.appendChild(g),g.addEventListener("load",()=>{m("debug",`Track "${n}" loaded successfully`)},{once:!0}),g.addEventListener("error",x=>{m("error",`Track "${n}" failed to load:`,x)},{once:!0});let y={element:g,label:n,language:o,kind:s,src:f,isActive:!1,exclusive:c,injectedAt:Date.now()};return it(e,y),dt(e),i&&setTimeout(()=>{at(e,g,c),y.isActive=!0},0),e.dispatchEvent(new CustomEvent(rt,{detail:{track:g,label:n,language:o}})),m("info",`Track "${n}" injected successfully`),{success:!0,track:g,method:"data-uri"}}catch(f){let g=f instanceof Error?f.message:"Unknown error";return m("error",`Track injection failed: ${g}`),{success:!1,error:g,method:"data-uri"}}}function at(e,t,r=!0){m("debug",`Activating track: "${t.label}"`);let n=e.textTracks;if(r){let o=S(e);for(let s=0;s<n.length;s++){let i=n[s];if(i.label!==t.label&&i.mode==="showing"){i.mode="disabled",m("debug",`Deactivated track: "${i.label}"`);let c=o.find(l=>l.element.track===i||l.label===i.label&&l.language===i.language);c&&(c.isActive=!1)}}}for(let o=0;o<n.length;o++){let s=n[o];if(s.label===t.label&&s.language===t.srclang){s.mode="showing",m("info",`Track "${t.label}" activated`);let c=S(e).find(l=>l.element===t);c&&(c.isActive=!0),e.dispatchEvent(new CustomEvent(ot,{detail:{track:t,label:t.label}})),ut(e);break}}}function lt(e,t){m("debug",`Deactivating track: "${t.label}"`);let r=e.textTracks;for(let n=0;n<r.length;n++){let o=r[n];if(o.label===t.label&&o.language===t.srclang){o.mode="disabled",m("info",`Track "${t.label}" deactivated`);let i=S(e).find(c=>c.element===t);i&&(i.isActive=!1);break}}}function ut(e){try{let t=new Event("change",{bubbles:!0});e.textTracks.dispatchEvent(t),e.dispatchEvent(new Event("texttrackchange",{bubbles:!0})),m("debug","Video.js track change notification dispatched")}catch(t){m("debug","Failed to notify Video.js:",t)}}function ae(e,t){m("info",`Removing track: "${t.label}"`),lt(e,t);let r=t.getAttribute("data-blob-url");if(r)try{URL.revokeObjectURL(r),m("debug","Blob URL revoked")}catch(n){m("debug","Failed to revoke Blob URL:",n)}t.remove(),ct(e,t),m("info",`Track "${t.label}" removed`)}function ce(e){m("info","Removing all injected tracks");let t=[...S(e)],r=t.length;for(let n of t)ae(e,n.element);m("info",`Removed ${r} tracks`)}function dt(e){if(F.has(e))return;let t=new MutationObserver(o=>{for(let s of o)for(let i of s.removedNodes)(i===e||i instanceof Element&&i.contains(e))&&(m("debug","Video element removed from DOM, cleaning up tracks"),ce(e),t.disconnect(),F.delete(e))}),r=e.parentElement;r&&t.observe(r,{childList:!0,subtree:!0});let n=()=>{t.disconnect(),ce(e)};F.set(e,n)}var ue="[UdemyCaptionPlus][NextLecture]";function le(...e){console.log(ue,...e)}function ft(...e){console.warn(ue,...e)}function E(e){return/^\d+$/.test(e)}function A(e){return typeof e=="number"&&Number.isFinite(e)?String(e):typeof e=="string"&&e.trim()!==""?e.trim():null}function gt(){try{let r=window.UD,n=[r?.config?.course?.id,r?.config?.brand?.course?.id,r?.course?.id,r?.courseTakingData?.courseId,r?.config?.lecture?.courseId];for(let o of n){let s=A(o);if(s&&E(s))return s}}catch{}try{let r=performance.getEntriesByType("resource");for(let n of r){let o=n?.name;if(typeof o!="string")continue;let s=o.match(/api-2\.0\/courses\/(\d+)/)||o.match(/subscribed-courses\/(\d+)/);if(s?.[1])return s[1]}}catch{}let t=document.querySelector("[data-course-id]")?.getAttribute("data-course-id")||"";return t&&E(t)?t:null}async function mt(e){if(E(e.courseId))return e.courseId;let t=gt();if(t)return t;try{let r=`https://www.udemy.com/api-2.0/courses/${encodeURIComponent(e.courseSlug)}/?fields[course]=id`,n=await fetch(r,{credentials:"include",signal:e.signal});if(!n.ok)return null;let o=await n.json(),s=A(o?.id);if(s&&E(s))return s}catch{}return null}function pt(){try{let e=window.UD,t=[()=>e?.lecture?.nextLecture?.id,()=>e?.lectureInfo?.next?.id,()=>e?.courseTakingData?.nextLecture?.id,()=>e?.config?.lecture?.next?.id,()=>e?.videoPlayer?.nextLecture?.id,()=>e?.data?.nextLectureId];for(let r of t){let n=r(),o=A(n);if(o&&E(o)){let s=A(e?.lecture?.nextLecture?.title)||void 0;return{id:o,title:s}}}}catch{}return null}async function Tt(e){let t=await mt(e);if(!t)return{nextLectureId:null,isLastLecture:!1,method:"none",error:"Unable to resolve numeric courseId for curriculum API"};let r=`https://www.udemy.com/api-2.0/courses/${t}/subscriber-curriculum-items/?page_size=1400&fields[lecture]=title,object_index,is_published,sort_order&fields[chapter]=title,object_index&fields[quiz]=title,object_index&fields[practice]=title,object_index&caching_intent=True`;try{let n=await fetch(r,{credentials:"include",signal:e.signal});if(!n.ok)return{nextLectureId:null,isLastLecture:!1,method:"none",error:`Curriculum API request failed: ${n.status}`};let o=await n.json(),i=(Array.isArray(o?.results)?o.results:[]).filter(u=>u&&u._class==="lecture"&&u.is_published!==!1).filter(u=>typeof u.id=="number").slice().sort((u,f)=>{let g=typeof u.object_index=="number"?u.object_index:typeof u.sort_order=="number"?u.sort_order:0,y=typeof f.object_index=="number"?f.object_index:typeof f.sort_order=="number"?f.sort_order:0;return g-y}),c=i.findIndex(u=>String(u.id)===e.currentLectureId);if(c<0)return{nextLectureId:null,isLastLecture:!1,method:"none",error:"Current lecture not found in curriculum"};if(c>=i.length-1)return{nextLectureId:null,isLastLecture:!0,method:"curriculum-api"};let l=i[c+1];return{nextLectureId:String(l.id),nextLectureTitle:typeof l.title=="string"?l.title:void 0,isLastLecture:!1,method:"curriculum-api"}}catch(n){return{nextLectureId:null,isLastLecture:!1,method:"none",error:String(n)}}}async function de(e){let t=await Tt(e);if(t.method==="curriculum-api"&&(t.nextLectureId||t.isLastLecture))return le("Resolved via curriculum API:",t.nextLectureId||"(last lecture)"),t;let r=pt();return r?(le("Resolved via UD fallback:",r.id),{nextLectureId:r.id,nextLectureTitle:r.title,isLastLecture:!1,method:"ud-fallback"}):(t.error&&ft("Failed to resolve via API:",t.error),{nextLectureId:null,isLastLecture:!1,method:"none",error:t.error})}var I={provider:"openai",apiKey:"",model:"gpt-5.1",openaiBaseUrl:"",geminiBaseUrl:"",enabled:!0,autoTranslate:!0,preloadEnabled:!0,showCostEstimate:!0,showLoadingIndicator:!0};var G="udemy-caption-settings";function U(){return typeof chrome<"u"&&!!chrome.storage?.sync}async function h(){return new Promise(e=>{if(U())chrome.storage.sync.get(I,t=>{e(t)});else{let t=localStorage.getItem(G);if(t)try{e({...I,...JSON.parse(t)})}catch{e(I)}else e(I)}})}async function ht(e){return new Promise((t,r)=>{if(U())chrome.storage.sync.set(e,()=>{chrome.runtime.lastError?r(new Error(chrome.runtime.lastError.message)):t()});else try{let n=localStorage.getItem(G),o={...n?JSON.parse(n):I,...e};localStorage.setItem(G,JSON.stringify(o)),t()}catch(n){r(n)}})}var $=new Set;function bt(e){return $.add(e),U()&&$.size===1&&chrome.storage.onChanged.addListener(fe),()=>{$.delete(e),U()&&$.size===0&&chrome.storage.onChanged.removeListener(fe)}}function fe(e,t){if(t!=="sync")return;let r={},n={};for(let o of Object.keys(e))o in I&&(r[o]=e[o].oldValue,n[o]=e[o].newValue);h().then(o=>{let s={...o};for(let i of Object.keys(r))r[i]!==void 0&&(s[i]=r[i]);for(let i of $)try{i(o,s)}catch(c){console.error("[SettingsManager] Error in change listener:",c)}})}function ge(e){return!!e.apiKey&&!!e.model&&!!e.provider}function V(e){return e.enabled&&ge(e)}var z=class{constructor(){this.cachedSettings=null;this.unsubscribe=null}async init(){return this.cachedSettings=await h(),this.unsubscribe=bt(t=>{this.cachedSettings=t}),this.cachedSettings}async getSettings(){return this.cachedSettings?this.cachedSettings:h()}async updateSettings(t){await ht(t),this.cachedSettings&&(this.cachedSettings={...this.cachedSettings,...t})}isEnabled(){return this.cachedSettings?V(this.cachedSettings):!1}isConfigured(){return this.cachedSettings?ge(this.cachedSettings):!1}destroy(){this.unsubscribe&&(this.unsubscribe(),this.unsubscribe=null),this.cachedSettings=null}},Rt=new z;var kt="udemy-caption-plus-loading-indicator",a="ucp-loading-indicator",yt=`
.${a} {
  position: absolute;
  z-index: 100000;
  padding: 10px 16px;
  border-radius: 6px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: opacity 0.3s ease, transform 0.3s ease;
  pointer-events: auto;
  max-width: 320px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.${a}--hidden {
  opacity: 0;
  pointer-events: none;
  transform: translateY(-10px);
}

/* Position variants */
.${a}--top-left {
  top: 12px;
  left: 12px;
}

.${a}--top-right {
  top: 12px;
  right: 12px;
}

.${a}--bottom-left {
  bottom: 60px;
  left: 12px;
}

.${a}--bottom-right {
  bottom: 60px;
  right: 12px;
}

.${a}--center {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.${a}--center.${a}--hidden {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.95);
}

/* Status variants */
.${a}--loading {
  background: rgba(164, 53, 240, 0.95);
  color: #fff;
}

.${a}--success {
  background: rgba(46, 125, 50, 0.95);
  color: #fff;
}

.${a}--error {
  background: rgba(198, 40, 40, 0.95);
  color: #fff;
  flex-direction: column;
  align-items: flex-start;
}

/* Spinner animation */
.${a}__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: ucp-spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes ucp-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Check icon for success */
.${a}__check {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.${a}__check::after {
  content: "";
  width: 4px;
  height: 8px;
  border: solid #2e7d32;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
  margin-top: -2px;
}

/* Error icon */
.${a}__error-icon {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.${a}__error-icon::after {
  content: "!";
  color: #c62828;
  font-size: 12px;
  font-weight: bold;
}

/* Message text */
.${a}__message {
  flex: 1;
}

/* Error details */
.${a}__details {
  font-size: 11px;
  opacity: 0.85;
  margin-top: 4px;
  word-break: break-word;
}

/* Error actions row */
.${a}__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  width: 100%;
}

/* Retry button */
.${a}__retry-btn {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.${a}__retry-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.${a}__retry-btn:active {
  transform: scale(0.98);
}

/* Dismiss button */
.${a}__dismiss-btn {
  padding: 6px 12px;
  font-size: 12px;
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
  border: none;
  cursor: pointer;
  transition: color 0.2s;
}

.${a}__dismiss-btn:hover {
  color: #fff;
}
`,P=new WeakMap,L=new WeakMap,T=new WeakMap,w=null;function q(){w&&document.head.contains(w)||(w=document.createElement("style"),w.id=`${kt}-styles`,w.textContent=yt,document.head.appendChild(w))}function W(e,t){let r=document.createElement("div");return r.className=`${a} ${a}--${t}`,M(r,e),r}function M(e,t){let{status:r,message:n,errorDetails:o,onRetry:s}=t;if(e.classList.remove(`${a}--loading`,`${a}--success`,`${a}--error`,`${a}--hidden`),r==="hidden"){e.classList.add(`${a}--hidden`);return}e.classList.add(`${a}--${r}`);let i="";if(r==="loading"?i=`
      <div class="${a}__spinner"></div>
      <span class="${a}__message">${R(n)}</span>
    `:r==="success"?i=`
      <div class="${a}__check"></div>
      <span class="${a}__message">${R(n)}</span>
    `:r==="error"&&(i=`
      <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
        <div class="${a}__error-icon"></div>
        <span class="${a}__message">${R(n)}</span>
      </div>
      ${o?`<div class="${a}__details">${R(o)}</div>`:""}
      <div class="${a}__actions">
        ${s?`<button class="${a}__retry-btn" type="button">\u91CD\u8BD5</button>`:""}
        <button class="${a}__dismiss-btn" type="button">\u5173\u95ED</button>
      </div>
    `),e.innerHTML=i,r==="error"){let c=e.querySelector(`.${a}__retry-btn`),l=e.querySelector(`.${a}__dismiss-btn`);c&&s&&c.addEventListener("click",()=>{s()}),l&&l.addEventListener("click",()=>{e.classList.add(`${a}--hidden`)})}}function R(e){let t=document.createElement("div");return t.textContent=e,t.innerHTML}function K(e){let t=['[data-purpose="video-player"]','[class*="video-player--container--"]',".vjs-tech",".video-js"];for(let r of t){let n=e.closest(r);if(n instanceof HTMLElement)return n}return e.parentElement||document.body}function me(e,t={}){let{message:r="\u5B57\u5E55\u7FFB\u8BD1\u4E2D\u2026",position:n="top-right",autoHideDelay:o=0}=t;q();let s={status:"loading",message:r};P.set(e,s);let i=T.get(e);i&&(clearTimeout(i),T.delete(e));let c=L.get(e),l=K(e);if(!c||!l.contains(c)?(c=W(s,n),L.set(e,c),window.getComputedStyle(l).position==="static"&&(l.style.position="relative"),l.appendChild(c),c.offsetHeight):(c.className=`${a} ${a}--${n}`,M(c,s)),o>0){let u=setTimeout(()=>{C(e)},o);T.set(e,u)}}function Z(e,t={}){let{message:r="\u7FFB\u8BD1\u5B8C\u6210",position:n="top-right",autoHideDelay:o=3e3}=t;q();let s={status:"success",message:r};P.set(e,s);let i=T.get(e);i&&(clearTimeout(i),T.delete(e));let c=L.get(e),l=K(e);if(!c||!l.contains(c)?(c=W(s,n),L.set(e,c),window.getComputedStyle(l).position==="static"&&(l.style.position="relative"),l.appendChild(c),c.offsetHeight):(c.className=`${a} ${a}--${n}`,M(c,s)),o>0){let u=setTimeout(()=>{C(e)},o);T.set(e,u)}}function J(e,t={}){let{message:r="\u7FFB\u8BD1\u5931\u8D25",errorDetails:n,onRetry:o,position:s="top-right",autoHideDelay:i=0}=t;q();let c={status:"error",message:r,errorDetails:n,onRetry:o};P.set(e,c);let l=T.get(e);l&&(clearTimeout(l),T.delete(e));let u=L.get(e),f=K(e);if(!u||!f.contains(u)?(u=W(c,s),L.set(e,u),window.getComputedStyle(f).position==="static"&&(f.style.position="relative"),f.appendChild(u),u.offsetHeight):(u.className=`${a} ${a}--${s}`,M(u,c)),i>0){let g=setTimeout(()=>{C(e)},i);T.set(e,g)}}function C(e){let t=L.get(e);if(!t)return;let r=T.get(e);r&&(clearTimeout(r),T.delete(e)),t.classList.add(`${a}--hidden`);let n=P.get(e);n&&(n.status="hidden")}var Lt="[UdemyCaptionPlus][Content]";function b(...e){console.log(Lt,...e)}function xt(e){return`${e}-${Date.now()}-${Math.random().toString(16).slice(2)}`}var k=null,X=null;async function j(e){let t=await h();if(!V(t)){b("Translation not enabled or not configured");return}let{videoDetection:r,vttContent:n}=await te();if(!r.found||!r.video){b("Video not found");return}if(!r.courseInfo){b("Course info not available");return}if(!n){b("No VTT content fetched");return}let o=r.courseInfo,s=e.taskId??xt(e.force?"retranslate":"translate"),i=o.courseId||o.courseSlug||"unknown-course",c=o.lectureId||"unknown-lecture";k=s,t.showLoadingIndicator&&me(r.video,{message:e.force?"\u6B63\u5728\u91CD\u65B0\u7FFB\u8BD1\u2026":"\u5B57\u5E55\u7FFB\u8BD1\u4E2D\u2026"});let l={type:"TRANSLATE_SUBTITLE",payload:{taskId:s,vttContent:n.content,originalHash:n.hash,courseId:i,lectureId:c,courseName:o.courseTitle||"",sectionName:o.sectionTitle||"",lectureName:o.lectureTitle||"",provider:t.provider,model:t.model,force:e.force}};try{await chrome.runtime.sendMessage(l)}catch(u){b("Failed to send translation request:",u),t.showLoadingIndicator&&J(r.video,{message:"\u8BF7\u6C42\u53D1\u9001\u5931\u8D25",errorDetails:String(u),onRetry:()=>j(e)})}}async function Te(){let e=await h();if(!V(e)||!e.preloadEnabled)return;let t=_();if(!t)return;let r=t.courseId||t.courseSlug||"unknown-course",n=t.lectureId,o=await de({courseId:r,courseSlug:t.courseSlug,currentLectureId:n});if(!o.nextLectureId)return;let s=`${r}-${o.nextLectureId}`;if(s===X)return;X=s;let i={type:"PRELOAD_NEXT",payload:{courseId:r,nextLectureId:o.nextLectureId,nextLectureTitle:o.nextLectureTitle||"",courseName:t.courseTitle||"",sectionName:t.sectionTitle||""}};try{await chrome.runtime.sendMessage(i)}catch(c){b("Failed to send preload request:",c)}}async function It(){if(!k)return;let e=k;k=null;let t=document.querySelector("video");t instanceof HTMLVideoElement&&C(t);try{await chrome.runtime.sendMessage({type:"CANCEL_TRANSLATION",payload:{taskId:e}})}catch{}}function wt(){typeof chrome>"u"||!chrome.runtime?.onMessage||chrome.runtime.onMessage.addListener((e,t,r)=>{if(!(!e||typeof e!="object")&&e.meta?.target!=="popup"){if(e.type==="RETRANSLATE_CURRENT"){let n=e.payload?.taskId;return j({force:!0,taskId:n}).then(()=>r?.({ok:!0})).catch(o=>r?.({ok:!1,error:String(o)})),!0}if(e.type==="CACHE_HIT"){e.payload?.taskId&&e.payload.taskId===k&&(k=null);let n=e.payload?.translatedVTT;if(typeof n=="string"&&n.trim().startsWith("WEBVTT")){let o=document.querySelector("video");o instanceof HTMLVideoElement&&(B(o,n,{activate:!0}),h().then(s=>{s.showLoadingIndicator&&Z(o,{message:"\u7F13\u5B58\u547D\u4E2D"})}))}return}if(e.type==="TRANSLATION_COMPLETE"){e.payload?.taskId&&e.payload.taskId===k&&(k=null);let n=e.payload?.translatedVTT,o=document.querySelector("video");if(e.payload?.success===!0&&typeof n=="string")o instanceof HTMLVideoElement&&(B(o,n,{activate:!0}),h().then(s=>{s.showLoadingIndicator&&Z(o,{message:"\u7FFB\u8BD1\u5B8C\u6210"})}));else{let s=e.payload?.error||"unknown error";b("Translation failed:",s),o instanceof HTMLVideoElement&&h().then(i=>{i.showLoadingIndicator&&J(o,{message:"\u7FFB\u8BD1\u5931\u8D25",errorDetails:String(s),onRetry:()=>j({force:!0})})})}return}}})}async function he(){try{let e=await h();if(!V(e)||!e.autoTranslate)return;await j({force:!1})}catch(e){b("Auto-translate init failed:",e)}}function pe(){return window.location.pathname.match(/\/learn\/lecture\/(\d+)/)?.[1]??null}function vt(){let e=pe();setInterval(()=>{let t=pe();!t||t===e||(e=t,X=null,It().then(()=>he()).then(()=>Te()).catch(r=>b("Lecture navigation handler failed:",r)))},1e3)}function St(){wt(),vt(),he(),Te()}St();})();
