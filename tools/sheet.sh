#!/bin/sh
# Contact sheet of the film: a grid of frames rendered with headless Chrome (SwiftShader), so reviewers need no live browser.
# usage: tools/sheet.sh "from=0&to=21&step=3[&at=1100][&list=1,5,9][&cols=4][&w=640&h=360]" out.png
# Slow (seconds per frame). Waits until tools/sheet.html sets its title to 'done'. Must run outside the command sandbox.
Q="$1"; OUT="$2"
read -r WW HH <<EOF2
$(node -e '
const q=new URLSearchParams(process.argv[1]),n=(k,d)=>q.has(k)?+q.get(k):d;
const w=n("w",640),h=n("h",360),c=n("cols",4);let k;
if(q.has("list"))k=q.get("list").split(",").length;else{k=0;for(let t=n("from",0);t<=n("to",21)+1e-6;t+=n("step",3))k++}
console.log(w*c,Math.ceil(k/c)*(h+26))' "$Q")
EOF2
P="${TMPDIR:-/tmp}/rijexamen-sheet-$$"; LOG="$P.log"
# dump-dom with a huge virtual-time budget never returns early, so poll the dev-tools port instead: run Chrome, wait for title 'done'.
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --user-data-dir="$P" --no-first-run --disable-extensions --hide-scrollbars \
  --window-size="$WW,$HH" --autoplay-policy=no-user-gesture-required --enable-unsafe-swiftshader --use-angle=swiftshader --remote-debugging-port=0 "http://localhost:8765/tools/sheet.html?$Q" >"$LOG" 2>&1 &
CP=$!
sleep 1; PORT=$(sed -n 's/.*DevTools listening on ws:\/\/[^:]*:\([0-9]*\)\/.*/\1/p' "$LOG" | head -1)
node -e '
const [port,out,W,H]=process.argv.slice(1);
(async()=>{
 const tabs=await (await fetch(`http://127.0.0.1:${port}/json`)).json();
 const t=tabs.find(x=>x.type==="page"); const ws=new WebSocket(t.webSocketDebuggerUrl); let id=0,p={};
 ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&p[m.id]) p[m.id](m.result)};
 await new Promise(r=>ws.onopen=r);
 const c=(method,params={})=>new Promise(r=>{p[++id]=r; ws.send(JSON.stringify({id,method,params}))});
 await c("Emulation.setDeviceMetricsOverride",{width:+W,height:+H,deviceScaleFactor:1,mobile:false});
 const t0=Date.now();
 for(;;){const r=await c("Runtime.evaluate",{expression:"document.title"}); if(r.result.value==="done")break; await new Promise(r=>setTimeout(r,1000)); if(Date.now()-t0>3600e3){console.error("timeout");process.exit(1)}}
 const s=await c("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});
 require("fs").writeFileSync(out,Buffer.from(s.data,"base64"));
 console.log("written",out,((Date.now()-t0)/1000).toFixed(0)+"s");
 process.exit(0);
})()' "$PORT" "$OUT" "$WW" "$HH"
kill $CP 2>/dev/null; rm -rf "$P" "$LOG"
