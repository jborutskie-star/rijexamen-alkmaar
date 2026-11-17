#!/bin/sh
# Screenshot a page of the local dev server with headless Chrome (WebGL through SwiftShader), for checking models without the app's browser pane.
# usage: tools/shot.sh "http://localhost:8765/debug/page.html?x=1" out.png [width height]
# The page gets 8 s of virtual time, so render once on load rather than waiting for input. Must run outside the command sandbox.
P="${TMPDIR:-/tmp}/rijexamen-shot-$$"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --user-data-dir="$P" --no-first-run --disable-extensions --hide-scrollbars \
  --window-size="${3:-1200},${4:-760}" --enable-unsafe-swiftshader --use-angle=swiftshader --virtual-time-budget=8000 --screenshot="$2" "$1" 2>&1 | grep -i "written\|console" ; rm -rf "$P"
