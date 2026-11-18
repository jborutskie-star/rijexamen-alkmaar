// These are repeating paint and height tiles for the town's original window and door bays.
const grey = (v) => `rgb(${v|0},${v|0},${v|0})`;
const noise = (x, y) => (Math.imul(x + 31 * y + 19, 2654435761) >>> 8) / 16777216;
const rect = (g, colour, x, y, w, h) => { g.fillStyle = colour; g.fillRect(x, y, w, h); };

export function bricks(g, bump, w, h) {
  rect(g, bump ? '#646464' : '#d5cfc3', 0, 0, w, h);
  for (let row = 0; row < h / 16; row++) for (let col = -1; col < w / 32; col++) {
    const x = col * 32 + (row % 2) * 16, y = row * 16, seed = noise((col + w / 32) % (w / 32), row);
    rect(g, bump ? grey(171 + seed * 22) : grey(230 + seed * 24), x + 1, y + 1, 30.5, 14.5);
    rect(g, bump ? '#9c9c9c' : 'rgba(104,83,65,.18)', x + 2, y + 13, 29, 2);
    rect(g, bump ? '#d0d0d0' : 'rgba(255,255,255,.38)', x + 2, y + 1, 28, 1.5);
    for (let k = 1; k <= 3; k++) {
      const streak = noise(k * 13, (seed * 256) | 0);
      rect(g, bump ? grey(165 + 30 * streak) : 'rgba(126,96,68,.1)', x + 3 + streak * 17, y + 3 + noise(k, col + row) * 9, 3 + streak * 5, 1);
    }
  }
}

function polygon(g, colour, points) {
  g.fillStyle = colour; g.beginPath();
  points.forEach(([x,y], i) => i ? g.lineTo(x,y) : g.moveTo(x,y)); g.closePath(); g.fill();
}

// Alpha distinguishes the painted timber and glazing from the tinted masonry.
function joinery(g, bump, x, y, w, h, paint) {
  if (bump) { paint(g); return; }
  const c = document.createElement('canvas'); c.width = g.canvas.width; c.height = g.canvas.height;
  paint(c.getContext('2d')); g.clearRect(x, y, w, h); g.globalAlpha = 0.5;
  g.drawImage(c, x, y, w, h, x, y, w, h); g.globalAlpha = 1;
}

function pane(g, bump, x, y, w, h, kind) {
  joinery(g, bump, x-12, y-12, w+24, h+24, (c) => {
    rect(c, bump ? '#d2d2d2' : '#c4b79e', x-12, y-12, w+24, h+24);
    rect(c, bump ? '#f0f0f0' : '#fbf5de', x-10, y-10, w+20, h+16);
    rect(c, bump ? '#999' : '#77847e', x-3, y-3, w+8, h+9);
    const sky = c.createLinearGradient(0, y, 0, y+h);
    sky.addColorStop(0,'#9ac0d7'); sky.addColorStop(.45,'#577a98'); sky.addColorStop(.48,'#455f78'); sky.addColorStop(1,'#25374d');
    rect(c, bump ? '#363636' : sky, x, y, w, h);
    if (!bump) {
      // A row of rooflines reflected across the street. Keep the panes dark enough to read as glass.
      polygon(c, 'rgba(39,56,70,.38)', [[x,y+h*.64],[x+w*.2,y+h*.47],[x+w*.31,y+h*.56],[x+w*.53,y+h*.35],[x+w*.72,y+h*.48],[x+w,y+h*.34],[x+w,y+h],[x,y+h]]);
      if (kind === 'sash') {
        for (const hand of [0,1]) {
          const at = (f) => x+w*(hand ? 1-f : f);
          polygon(c,'#d5cfb7',[[at(0),y+h*.06],[at(.23),y+h*.06],[at(.06),y+h*.61],[at(.16),y+h*.98],[at(0),y+h*.98]]);
          polygon(c,'#a79e85',[[at(.11),y+h*.06],[at(.15),y+h*.06],[at(.055),y+h*.61]]);
        }
      }
      if (kind === 'shop') {
        for (let i=0;i<7;i++) {
          const px = x+w*(.08+i*.13), ph = h*(.07+noise(i,8)*.14);
          rect(c,['#ad7953','#99ada5','#d9b872'][i%3],px,y+h*.84-ph,w*.07,ph);
          rect(c,'#d7c6a7',px,y+h*.84-ph,w*.07,2);
        }
        rect(c,'#aa9272',x,y+h*.84,w,h*.035);
      }
      polygon(c,'rgba(225,244,250,.17)',[[x,y],[x+w*.59,y],[x,y+h*.46]]);
      rect(c,'rgba(20,35,43,.25)',x,y,w,4);
    }
    const bar = (px,py,pw,ph) => {
      rect(c,bump?'#969696':'#777f78',px+2,py+2,pw,ph);
      rect(c,bump?'#dbdbdb':'#e8e4cc',px,py,pw,ph);
      rect(c,bump?'#eee':'#fff8e4',px,py,pw,2);
    };
    bar(x+w/2-3,y,6,h-2); bar(x,y+h*.45,w-2,6);
    if (kind==='shop') { bar(x+w*.25-2,y,4,h*.45); bar(x+w*.75-2,y,4,h*.45); }
  });
}

function lintel(g,b,x,y,w,h) {
  rect(g,b?'#aaa':'rgba(89,61,38,.25)',x,y,w,h);
  const n = Math.max(7, Math.round(w/12));
  for (let i=0;i<n;i++) {
    const dx=x+w*i/n;
    rect(g,b?'#d2d2d2':grey(214+noise(i,17)*29),dx+1,y+1,w/n-2,h-3);
  }
  rect(g,b?'#e5e5e5':'rgba(255,250,224,.8)',x+w*.5-7,y-2,14,h+3);
}

function sill(g,b,x,y,w) {
  rect(g,b?'#888':'rgba(68,52,41,.32)',x+2,y+4,w,9);
  rect(g,b?'#ddd':'#d8ceba',x,y,w,8); rect(g,b?'#eee':'#f9f2d9',x,y,w,3);
}

function shutter(g,b,x) {
  joinery(g,b,x,56,34,152,(c) => {
    rect(c,b?'#d5d5d5':'#315643',x,56,34,152);
    rect(c,b?'#aaa':'#213f36',x+4,62,26,138);
    for(let y=64;y<200;y+=12) {
      rect(c,b?'#d9d9d9':'#48715a',x+5,y,24,7);
      rect(c,b?'#e5e5e5':'#64846a',x+5,y,24,2);
    }
    for(const y of [80,180]) {
      rect(c,b?'#eee':'#303c35',x+2,y,15,4);
      rect(c,b?'#fff':'#ac9c6d',x+4,y+1,2,2);
    }
  });
}

function door(g,b) {
  joinery(g,b,284,62,92,194,(c) => {
    rect(c,b?'#e8e8e8':'#efe5cc',284,62,92,194);
    rect(c,b?'#7a7a7a':'#214a37',292,72,76,176);
    rect(c,b?'#adadad':'#7d866b',302,83,56,62);
    rect(c,b?'#464646':'#6689a0',306,87,48,54);
    for(const x of [320,338]) rect(c,b?'#bbb':'#d3c6a3',x,87,3,54);
    rect(c,b?'#bbb':'#d3c6a3',306,108,48,3);
    for(const y of [165,204]) for(const x of [301,332]) {
      rect(c,b?'#aaa':'#55735b',x,y,23,32);
      rect(c,b?'#666':'#183d30',x+3,y+3,19,28);
      rect(c,b?'#999':'#2f5c44',x+5,y+5,15,23);
    }
    rect(c,b?'#bebebe':'#bb9546',313,152,28,5); rect(c,b?'#444':'#504431',315,153,24,2);
    rect(c,b?'#ddd':'#d9b762',358,150,6,12); rect(c,b?'#fff':'#ffe5a0',356,154,9,4);
    rect(c,b?'#bbb':'#aba894',289,249,83,7);
  });
}

export const FACADES = {
  a: [256,256,(g,b) => { bricks(g,b,256,256); lintel(g,b,57,20,142,17); pane(g,b,72,52,112,152,'sash'); sill(g,b,52,216,152); }],
  b: [256,256,(g,b) => { bricks(g,b,256,256); lintel(g,b,66,28,124,18); shutter(g,b,34); shutter(g,b,188); pane(g,b,86,68,84,128,'casement'); sill(g,b,66,216,124); }],
  shop: [512,256,(g,b) => {
    bricks(g,b,512,256);
    rect(g,b?'#bbb':'#c2b6a7',0,12,512,29); rect(g,b?'#eee':'#f2e7ce',0,10,512,6);
    rect(g,b?'#ccc':'#dacfb6',0,36,512,6); rect(g,b?'#888':'#a89d8c',0,42,512,5);
    rect(g,b?'#bbb':'#c9c2af',0,225,512,31); rect(g,b?'#ddd':'#eee4cc',0,224,512,5);
    pane(g,b,32,80,192,120,'shop'); pane(g,b,404,84,76,92,'casement'); door(g,b);
  }]
};

export function pantiles(g,bump) {
  for (let y=0;y<128;y+=32) for(let x=0;x<128;x+=32) {
    const clay = 228 + noise(x/32,y/32)*22, roll=g.createLinearGradient(x,0,x+32,0);
    for(const [u,height,tint] of [[0,125,-18],[.13,218,2],[.25,235,5],[.44,154,-2],[.69,84,-15],[1,125,-18]])
      roll.addColorStop(u,grey(bump?height:clay+tint));
    rect(g,roll,x,y,32,32);
    const lap=g.createLinearGradient(0,y,0,y+32);
    lap.addColorStop(0,bump?'rgba(0,0,0,.32)':'rgba(64,43,33,.28)'); lap.addColorStop(.22,'rgba(0,0,0,0)');
    lap.addColorStop(.89,'rgba(255,255,255,0)'); lap.addColorStop(1,'rgba(255,255,255,.2)');
    rect(g,lap,x,y,32,32);
  }
}

// Cut an opening out of a bay, with four bevelled returns and a recessed painted sash.
export function recessedBay(panel, bounds, opening, depth) {
  const [l,b,r,t] = bounds, [wl,wb,wr,wt] = opening;
  const loop = (a,y,c,h) => [[a,y],[c,y],[c,h],[a,h]];
  const outside = loop(l,b,r,t), lip = loop(wl,wb,wr,wt);
  const rebate = loop(wl+0.012,wb+0.012,wr-0.012,wt-0.012);
  for(let i=0;i<4;i++) {
    const j=(i+1)%4;
    panel([outside[i],outside[j],lip[j],lip[i]],[0,0,0,0]);
    panel([lip[i],lip[j],rebate[j],rebate[i]],[0,0,depth,depth]);
  }
  panel(rebate,[depth,depth,depth,depth]);
}
