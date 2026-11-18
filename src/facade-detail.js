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
  const c = document.createElement('canvas'); c.width = g.canvas.width; c.height = 256;
  paint(c.getContext('2d')); g.clearRect(x, y, w, h); g.globalAlpha = 0.5;
  g.drawImage(c, x, y, w, h, x, y, w, h); g.globalAlpha = 1;
}

function pane(g, bump, x, y, w, h, kind, style=0) {
  joinery(g, bump, x-12, y-12, w+24, h+24, (c) => {
    rect(c, bump ? '#d2d2d2' : '#c4b79e', x-12, y-12, w+24, h+24);
    rect(c, bump ? '#f0f0f0' : ['#fbf5de','#e8dcc4','#d4ded4','#faf0cc'][style%4], x-10, y-10, w+20, h+16);
    rect(c, bump ? '#999' : '#77847e', x-3, y-3, w+8, h+9);
    const sky = c.createLinearGradient(0, y, 0, y+h);
    sky.addColorStop(0,'#9ac0d7'); sky.addColorStop(.45,'#577a98'); sky.addColorStop(.48,'#455f78'); sky.addColorStop(1,'#25374d');
    rect(c, bump ? '#363636' : sky, x, y, w, h);
    if (!bump) {
      // A row of rooflines reflected across the street. Keep the panes dark enough to read as glass.
      polygon(c, 'rgba(39,56,70,.38)', [[x,y+h*.64],[x+w*.2,y+h*.47],[x+w*.31,y+h*.56],[x+w*.53,y+h*.35],[x+w*.72,y+h*.48],[x+w,y+h*.34],[x+w,y+h],[x,y+h]]);
      if (kind === 'sash' && style%3===0) {
        for (const hand of [0,1]) {
          const at = (f) => x+w*(hand ? 1-f : f);
          polygon(c,'#d5cfb7',[[at(0),y+h*.06],[at(.23),y+h*.06],[at(.06),y+h*.61],[at(.16),y+h*.98],[at(0),y+h*.98]]);
          polygon(c,'#a79e85',[[at(.11),y+h*.06],[at(.15),y+h*.06],[at(.055),y+h*.61]]);
        }
      }
      if (kind === 'shop') {
        c.save(); c.translate(x,y); c.scale(w/192,h/120);
        display(c,style); c.restore();
      } else if (style%3===1) {
        const blind=h*.29;
        rect(c,'#d4c3a0',x,y,w,blind);
        for(let yy=y+4;yy<y+blind;yy+=6)rect(c,'#968f78',x,yy,w,1.7);
        rect(c,'#e8debb',x+w*.9,y+blind,1.8,h*.2);
      } else if (style%3===2) {
        for(const side of [0,1]) {
          const edge=x+w*side, dx=(side?-1:1)*w*.19;
          polygon(c,'#dfddcc',[[edge,y],[edge+dx,y],[edge+dx*.75,y+h],[edge,y+h]]);
          rect(c,'rgba(99,110,103,.32)',edge+(side?-1:1)*w*.1,y,2,h);
        }
        if(w>80) {
          rect(c,'#b2b6a6',x,y+h*.78,w,h*.2);
          rect(c,'#d6d9c4',x,y+h*.78,w,2);
        }
      }
      polygon(c,'rgba(225,244,250,.17)',[[x,y],[x+w*.59,y],[x,y+h*.46]]);
      rect(c,'rgba(20,35,43,.25)',x,y,w,4);
    }
    const bar = (px,py,pw,ph) => {
      rect(c,bump?'#969696':'#777f78',px+2,py+2,pw,ph);
      rect(c,bump?'#dbdbdb':'#e8e4cc',px,py,pw,ph);
      rect(c,bump?'#eee':'#fff8e4',px,py,pw,2);
    };
    const transom=kind==='shop' ? .20 : [.43,.30,.49,.24][style%4];
    if(kind!=='shop' || style%2===0)bar(x+w/2-3,y,6,h-2);
    if(kind==='shop' && style%2)for(const f of [.34,.67])bar(x+w*f-2,y,4,h-1);
    bar(x,y+h*transom,w-2,5);
    if(style%3!==2)for (const f of [.25,.75])bar(x+w*f-2,y,3,h*transom);
    if(kind!=='shop' && style%4===3)bar(x,y+h*.67,w-2,4);
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

function shutter(g,b,x,style) {
  joinery(g,b,x,56,34,152,(c) => {
    rect(c,b?'#d5d5d5':['#315643','#40596b','#5a634d','#8e4236'][style],x,56,34,152);
    rect(c,b?'#aaa':'#213f36',x+4,62,26,138);
    if(style%2) {
      for(const y of [64,135]) {
        rect(c,b?'#bebebe':(style===1?'#587185':'#a85b48'),x+5,y,24,62);
        polygon(c,b?'#ddd':(style===1?'#849491':'#c29871'),[[x+17,y+5],[x+26,y+30],[x+17,y+55],[x+8,y+30]]);
      }
    } else for(let y=64;y<200;y+=12) {
      rect(c,b?'#d9d9d9':'#48715a',x+5,y,24,7);
      rect(c,b?'#e5e5e5':'#64846a',x+5,y,24,2);
    }
    for(const y of [80,180]) {
      rect(c,b?'#eee':'#303c35',x+2,y,15,4);
      rect(c,b?'#fff':'#ac9c6d',x+4,y+1,2,2);
    }
  });
}

function door(g,b,style) {
  joinery(g,b,284,62,92,194,(c) => {
    rect(c,b?'#e8e8e8':'#efe5cc',284,62,92,194);
    rect(c,b?'#7a7a7a':TINTS[style],292,72,76,176);
    rect(c,b?'#adadad':'#7d866b',302,83,56,62);
    rect(c,b?'#464646':'#6689a0',306,87,48,54);
    for(const x of [320,338]) rect(c,b?'#bbb':'#d3c6a3',x,87,3,54);
    rect(c,b?'#bbb':'#d3c6a3',306,108,48,3);
    for(const y of [165,204]) for(const x of [301,332]) {
      rect(c,b?'#aaa':'#55735b',x,y,23,32);
      rect(c,b?'#666':'#183d30',x+3,y+3,19,28);
      rect(c,b?'#999':TINTS[style],x+5,y+5,15,23);
    }
    rect(c,b?'#bebebe':'#bb9546',313,152,28,5); rect(c,b?'#444':'#504431',315,153,24,2);
    rect(c,b?'#ddd':'#d9b762',358,150,6,12); rect(c,b?'#fff':'#ffe5a0',356,154,9,4);
    rect(c,b?'#bbb':'#aba894',289,249,83,7);
  });
}

// Six shop interiors in one atlas. All fixtures stay behind the glass.
const TINTS=['#285544','#5e4546','#3e586b','#744b36','#57664e','#814f37'];
const OVAL=(g,colour,x,y,rx,ry,angle=0) => {g.fillStyle=colour;g.beginPath();g.ellipse(x,y,rx,ry,angle,0,2*Math.PI);g.fill();};
function display(g,style) {
  const shelf=(y) => {rect(g,'#6a5345',0,y,192,5);rect(g,'#d4b490',0,y,192,2);};
  const shelfY=104;
  const rooms=[['#495746','#938e72'],['#705244','#b9a17e'],['#515f66','#a7b3a5'],['#53453e','#8e7864'],['#5b6151','#ada387'],['#52636a','#8b9491']];
  const back=g.createLinearGradient(0,25,0,116);
  back.addColorStop(0,rooms[style][0]);back.addColorStop(1,rooms[style][1]);
  rect(g,back,0,29,192,91);
  polygon(g,'rgba(33,37,39,.32)',[[0,21],[17,33],[17,104],[0,114]]);
  polygon(g,'rgba(231,219,184,.17)',[[173,34],[192,21],[192,114],[173,103]]);
  rect(g,'rgba(229,220,188,.27)',17,33,157,2);
  if(style===0||style===1||style===4) {
    for(const x of [28,105,168]) {
      rect(g,'#534f43',x,25,1.8,10);
      OVAL(g,'#d1bb88',x+1,37,5.5,2.2);
    }
  }

  if(style===0) { // flower shop, with three buckets and a tall spray
    for (const [cx,cy,n] of [[27,100,7],[93,100,11],[157,99,8]]) {
      for(let i=0;i<n;i++) {
        const px=cx-20+40*noise(i,cx),py=36+40*noise(i+64,cx);
        g.strokeStyle='#718263';g.lineWidth=2;g.beginPath();g.moveTo(cx,87);g.lineTo(px,py);g.stroke();
        OVAL(g,'#53735c',(cx+px)/2+3,(87+py)/2,3.6,7,-.55);
        const petal=['#ec9574','#f4d779','#d38aa7'][i%3];
        for(let j=0;j<4;j++){const a=j*Math.PI*.5;OVAL(g,petal,px+2.8*Math.cos(a),py+2.5*Math.sin(a),3.2,3.8,a);}
        OVAL(g,'#c88448',px,py,2.4,2.5);
      }
      polygon(g,'#b6b9a6',[[cx-13,77],[cx+13,77],[cx+10,cy],[cx-9,cy]]);
      rect(g,'#dce0ce',cx-13,77,26,3);
    }
  } else if(style===1) { // bread in willow baskets
    rect(g,'#967859',0,51,192,5);
    for(let i=0;i<9;i++) {
      const x=i*23+5, y=i%3?100:52;
      OVAL(g,'#c58e51',x,y-5,i%2?12:8,i%2?7:18,i%2?0:.32);
      for(let k=0;k<3;k++)OVAL(g,'#edc789',x-4+k*3,y-8+k*2,3,1.2,-.65);
    }
    for(const x of [43,111,160]) {polygon(g,'#8d603d',[[x-21,90],[x+21,90],[x+16,104],[x-17,104]]);rect(g,'#c79158',x-21,89,42,4);}
  } else if(style===2) { // a Delftware shop
    for(const [y,n] of [[61,4],[104,5]]) {
      for(let i=0;i<n;i++) {
        const x=19+i*(151/(n-1)),r=9+noise(i,n)*5;
        OVAL(g,'#e6e2ca',x,y-r*.7,r,r*.78);rect(g,'#dedcc7',x-r*.38,y-r*1.85,r*.76,r*.75);
        rect(g,'#456c89',x-r*.4,y-r*1.82,r*.8,3);OVAL(g,'#587999',x,y-r*.7,r*.65,2.1);
        for(const dx of [-.35,0,.35])OVAL(g,'#648ba0',x+dx*r,y-r*.72,1.5,2.8,dx);
      }
      shelf(y);
    }
  } else if(style===3) { // bookshop counter and two bookcases
    for(const y of [63,104]) {
      let x=5;for(let i=0;x<185;i++) {
        const w=4+noise(i,3)*7,h=14+noise(i,9+y)*18;
        rect(g,['#867456','#a78b5c','#829284','#a97862','#6f8091'][i%5],x,y-h,w,h);
        rect(g,'#cfc1a1',x+1,y-h+5,w-2,1.8); x+=w+1;
      }
      shelf(y);
    }
  } else if(style===4) { // café chairs, little tables, and pendant shades
    for(const x of [46,141]) {
      rect(g,'#d3ccaa',x-1,0,2,40);
      polygon(g,'#e6c787',[[x-13,49],[x-4,39],[x+4,39],[x+13,49]]);
      rect(g,'#d4ab83',x-24,83,48,4);rect(g,'#896d56',x-2,87,4,17);
      for (const off of [-27,23]) {rect(g,'#b9a387',x+off,77,3,27);rect(g,'#b9a387',x+off,92,10,2);}
      rect(g,'#e9e0cc',x-10,76,8,6);
    }
  } else { // a private front room between the shops
    for(const side of [0,1]) {
      const e=side?192:0, d=side?-1:1;
      polygon(g,'#ddd3b4',[[e,0],[e+d*45,0],[e+d*13,67],[e+d*35,114],[e,114]]);
      for(const u of [8,19,31])polygon(g,'#b8af96',[[e+d*u,0],[e+d*(u+2),0],[e+d*u*.3,65]]);
    }
    OVAL(g,'#e8cca0',101,61,16,7);polygon(g,'#cfb189',[[85,61],[94,48],[107,48],[117,61]]);
    rect(g,'#9a8369',100,64,3,26);rect(g,'#b69570',81,91,41,5);
  }
  if(style!==2 && style!==3) shelf(shelfY);
}

const upperStyles=4, shopStyles=6;
export const ROWS={a:upperStyles,b:upperStyles,shop:shopStyles};
function atlas(width,rows,draw) {
  return [width,256*rows,(g,bump) => {
    for(let style=0;style<rows;style++) {
      g.save();g.translate(0,(rows-1-style)*256);draw(g,bump,style);g.restore();
    }
  }];
}
function masonryTrim(g,b,style,w) {
  if(style%2) {
    for(const y of [3,238]) {
      rect(g,b?'#d2d2d2':'#e5dcca',0,y,w,6);
      for(let x=31;x<w;x+=64)rect(g,b?'#888':'#b5ac96',x,y,2,6);
    }
  } else {
    for(let y=8;y<230;y+=32) {
      const d=y%64===8?15:9;
      for(const x of [0,w-d])rect(g,b?'#ccc':'#e9deca',x,y,d,14);
    }
  }
}
function upper(g,b,style,shutters) {
  bricks(g,b,256,256);masonryTrim(g,b,style,256);
  if(shutters) {
    lintel(g,b,66,28,124,18);shutter(g,b,34,style);shutter(g,b,188,style);
    pane(g,b,86,68,84,128,'casement',style);sill(g,b,66,216,124);
  } else {
    lintel(g,b,57,20,142,17);pane(g,b,72,52,112,152,'sash',style);sill(g,b,52,216,152);
  }
}

export const FACADES = {
  a:atlas(256,upperStyles,(g,b,style)=>upper(g,b,style,false)),
  b:atlas(256,upperStyles,(g,b,style)=>upper(g,b,style,true)),
  waag:atlas(512,2,(g,b,level)=>{
    if (level===0) {
      rect(g,b?'#555':'#aaa796',0,0,512,256);
      for(let row=0;row<8;row++)for(let i=-1;i<8;i++) {
        const x=64*i+(row%2)*32,y=32*row,t=noise(i+8,row);
        rect(g,b?'#9f9f9f':grey(213+t*27),x+1,y+1,62,30);
        rect(g,b?'#ccc':grey(195+t*34),x+4,y+4,55,23);
        rect(g,b?'#898989':'rgba(91,77,60,.35)',x+4,y+26,55,2);
      }
    } else bricks(g,b,512,256);
    for(const x of [0,256]) {
      if(level===0) {
        joinery(g,b,x+28,38,200,202,c=>{
          const arch=(ox,oy,w,h,colour) => {
            c.fillStyle=colour;c.beginPath();c.moveTo(ox,oy+h);c.lineTo(ox,oy+w*.3);
            c.bezierCurveTo(ox,oy-w*.1,ox+w,oy-w*.1,ox+w,oy+w*.3);
            c.lineTo(ox+w,oy+h);c.closePath();c.fill();
          };
          arch(x+28,42,200,198,b?'#ddd':'#c1b59a');
          arch(x+38,52,180,188,b?'#555':'#343f37');
          for(let k=0;k<9;k++) {
            const a=Math.PI*(1+k/9),z=Math.PI*(1+(k+1)/9)-.022;
            const pt=(t,r,ry)=>[x+128+Math.cos(t)*r,115+Math.sin(t)*ry];
            polygon(c,b?'#ccc':grey(158+noise(k,42)*64),[pt(a,90,62),pt(a,111,81),pt(z,111,81),pt(z,90,62)]);
          }
          for(let i=0;i<8;i++)rect(c,b?'#888':'#4e5a4e',x+43+i*21,112,4,124);
          rect(c,b?'#aaa':'#7b765e',x+37,116,182,8);rect(c,b?'#aaa':'#7b765e',x+37,207,182,7);
          for(const xx of [x+71,x+184]) {rect(c,b?'#aaa':'#39483f',xx,158,21,5);OVAL(c,b?'#ddd':'#c3a455',xx+2,160,3.1,3.1);}
          if(!x)for(const fx of [-.36,-.18,0,.18,.36]){
            c.strokeStyle=b?'#aaa':'#c4b88e';c.lineWidth=2.3;c.beginPath();c.moveTo(x+127,107);c.lineTo(x+127+fx*175,64+Math.abs(fx)*60);c.stroke();
          }
        });
      } else {
        lintel(g,b,x+52,20,152,17);pane(g,b,x+76,56,104,137,'casement',2);
        for(const dx of [x+29,x+193])joinery(g,b,dx,60,30,142,c=>{
          rect(c,b?'#bbb':'#9d483c',dx,60,30,142);
          polygon(c,b?'#ddd':'#e0b68f',[[dx+15,68],[dx+27,129],[dx+15,188],[dx+3,129]]);
          for(const y of [75,182])rect(c,b?'#ccc':'#3f5147',dx+1,y,27,4);
        });
        sill(g,b,x+58,207,141);
      }
    }
    for(const y of [3,238])rect(g,b?'#ddd':'#e5d9be',0,y,512,8);
  }),
  shop:atlas(512,shopStyles,(g,b,style)=>{
    bricks(g,b,512,256);
    joinery(g,b,0,3,512,47,(c)=>{
      rect(c,b?'#bababa':TINTS[style],0,3,512,47);
      rect(c,b?'#eee':'#e8ddbf',0,4,512,5);rect(c,b?'#ddd':'#d4c3a2',0,39,512,4);
      for(let x=6;x<510;x+=64){rect(c,b?'#ccc':'#a99a7a',x,14,52,2);rect(c,b?'#aaa':'#766952',x,32,52,2);}
    });
    joinery(g,b,0,220,512,36,(c)=>{
      rect(c,b?'#aaa':TINTS[style],0,220,512,36);
      rect(c,b?'#ddd':'#d6c7a5',0,220,512,5);
      for(let x=4;x<512;x+=32) {rect(c,b?'#bcbcbc':'#8b8370',x,231,25,15);rect(c,b?'#969696':TINTS[style],x+2,233,21,11);}
    });
    for(const x of [4,252,379,501]) {
      joinery(g,b,x,49,9,172,c=>{
        rect(c,b?'#ccc':TINTS[style],x,49,9,172);rect(c,b?'#eee':'#d1c7a9',x,52,2,160);
      });
    }
    pane(g,b,32,80,192,120,'shop',style);pane(g,b,404,84,76,92,'casement',style);door(g,b,style);
  })
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


// One revolution around the bastion contains eight bays of hand-laid masonry.
// The segmental drain arch and iron grille are relief painted into the original wall.
export function rampart(g,b) {
  const w=512,h=256;
  rect(g,b?'#555':'#c8beb0',0,0,w,h);
  for(let row=0;row<14;row++)for(let i=-1;i<16;i++) {
    const x=i*32+(row%2)*16,y=row*19,v=noise((i+16)%16,row);
    rect(g,b?grey(164+v*32):grey(185+v*63),x+1.5,y+1.5,29,16);
    rect(g,b?'#ccc':'rgba(250,232,197,.24)',x+3,y+2,26,2);
    rect(g,b?'#888':'rgba(72,41,29,.18)',x+3,y+15,26,2);
  }
  const arch=(rx,ry,baseline,colour)=>{
    g.beginPath();g.moveTo(256-rx,235);g.lineTo(256-rx,baseline);
    g.ellipse(256,baseline,rx,ry,0,Math.PI,Math.PI*2);g.lineTo(256+rx,235);g.closePath();g.fillStyle=colour;g.fill();
  };
  arch(36,25,181,b?'#666':'#ac9983');arch(27,17,184,b?'#424242':'#564b40');
  for(let i=0;i<9;i++) {
    const t=Math.PI+i*Math.PI/9,u=t+Math.PI/9-.027;
    const at=(a,rx,ry)=>[256+Math.cos(a)*rx,181+Math.sin(a)*ry];
    polygon(g,b?'#c5c5c5':grey(182+noise(i,32)*52),[at(t,29,19),at(t,44,33),at(u,44,33),at(u,29,19)]);
  }
  for(let x=236;x<=276;x+=8)rect(g,b?'#9a9a9a':'#73685b',x,183,3,51);
  rect(g,b?'#aaa':'#9d9382',226,207,60,4);
  rect(g,b?'#777':'rgba(40,42,31,.2)',0,239,w,17);
}
