import {initializeApp} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {getAuth,signInAnonymously} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {getDatabase,ref,onValue,set,update,remove} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js";
import {firebaseConfig} from "./firebase-config.js";
const $=id=>document.getElementById(id), owner=new URLSearchParams(location.search).get("owner")==="1", path="rooms/main";
function show(id){$(id).classList.remove("hidden")} function hide(id){$(id).classList.add("hidden")}
function fail(e){$("loading").classList.add("hidden");$("error").textContent=e?.message||String(e);show("error")}
async function main(){
 const app=initializeApp(firebaseConfig),auth=getAuth(app);await signInAnonymously(auth);
 const db=getDatabase(app),room=ref(db,path);hide("loading");
 if(owner){show("ownerView");onValue(room,s=>{const d=s.val();$("ownerAnswer").textContent=!d||!d.choice?"هنوز انتخابی ثبت نشده.":!d.time?"دوستت آره رو انتخاب کرده؛ هنوز زمان رو انتخاب نکرده.":`پاسخ: آره\nزمان: ${d.time}`});$("resetBtn").onclick=()=>remove(room);return}
 show("guestView");let n=0,scale=1;
 function runAway(){const b=$("noBtn"),r=b.getBoundingClientRect();n++;b.style.position="fixed";b.style.left=Math.max(8,Math.random()*(innerWidth-r.width-16))+"px";b.style.top=Math.max(8,Math.random()*(innerHeight-r.height-16))+"px";b.style.zIndex=5;b.style.transform=`scale(${Math.max(.45,1-n*.055)})`;scale=Math.min(1.65,scale+.07);$("yesBtn").style.transform=`scale(${scale})`;if(n>=10){b.style.position="relative";b.style.left="auto";b.style.top="auto";b.style.transform="scale(.7)"}}
 $("noBtn").addEventListener("pointerenter",runAway);$("noBtn").addEventListener("click",e=>{e.preventDefault();runAway()});$("noBtn").addEventListener("touchstart",e=>{e.preventDefault();runAway()},{passive:false});
 $("yesBtn").onclick=async()=>{await set(room,{choice:"yes",time:null,updatedAt:Date.now()});hide("questionActions");show("timeStep")};
 document.querySelectorAll(".timeBtn").forEach(b=>b.onclick=async()=>{await update(room,{choice:"yes",time:b.dataset.time,updatedAt:Date.now()});hide("timeStep");show("thanksStep")});
}
main().catch(fail);
