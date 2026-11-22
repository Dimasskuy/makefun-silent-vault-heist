// All drawing lives here: the museum, the cones, the thief, the HUD and
// every screen. It never changes the world; it only paints the state it is
// handed. The canvas is a fixed 1280x720 logical area scaled to the window.
//
// Art direction (see ~/workspace/makefun-heist-game/UPGRADE-ART-BRIEF.md):
// dark night museum, warm lamp pools, marble/wood/steel floors drawn
// procedurally per tile, gold-trimmed walls, framed paintings, glass
// display cases; guards and the thief are real figures (uniform + cap +
// flashlight vs hoodie + mask + backpack), not circles.

const SCREEN_TITLE = 'title';
const SCREEN_INTRO = 'intro';
const SCREEN_PLAY = 'play';
const SCREEN_PAUSED = 'paused';
const SCREEN_BUSTED = 'busted';
const SCREEN_CLEARED = 'cleared';
const SCREEN_FINAL = 'final';

const TINTS = {
  gallery: PALETTE.floorGallery,
  office: PALETTE.floorOffice,
  vault: PALETTE.floorVault,
  crown: PALETTE.floorCrown,
};

/** Deterministic per-tile hash in [0,1): the same tile always draws the
 * same texture, so screenshots stay byte-identical per seed. */
function tileHash(x, y) {
  let n = (x * 374761393 + y * 668265263) ^ 0x5bf03635;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

/** A vision cone with a soft radial gradient: bright at the source, fading
 * to nothing at the edge of the range, plus a brighter inner core. */
function drawCone(ctx, x, y, angle, range, halfAngle, rgb) {
  const grad = ctx.createRadialGradient(x, y, 8, x, y, range);
  grad.addColorStop(0, `rgba(${rgb},0.42)`);
  grad.addColorStop(0.55, `rgba(${rgb},0.20)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, range, angle - halfAngle, angle + halfAngle);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  // Brighter core so the cone's direction reads at a glance.
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, range * 0.85, angle - halfAngle * 0.55, angle + halfAngle * 0.55);
  ctx.closePath();
  ctx.fillStyle = `rgba(${rgb},0.16)`;
  ctx.fill();
  // Soft fading rim.
  ctx.beginPath();
  ctx.arc(x, y, range, angle - halfAngle, angle + halfAngle);
  ctx.strokeStyle = `rgba(${rgb},0.25)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || FIELD.width;
    const h = canvas.clientHeight || FIELD.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(canvas.width / FIELD.width, 0, 0, canvas.height / FIELD.height, 0, 0);
  }
  window.addEventListener('resize', fit);
  fit();

  function drawFloor(state) {
    const level = LEVELS[state.levelIndex];
    const base = TINTS[level.tint] || PALETTE.floorA;
    for (let y = 0; y < level.map.length; y += 1) {
      for (let x = 0; x < level.map[y].length; x += 1) {
        const ch = level.map[y][x];
        if (ch === '#') continue;
        const px = x * TILE;
        const py = y * TILE;
        const h = tileHash(x, y);
        if (ch === 'c') {
          // Creaky floorboards: warm wood planks, visibly different from
          // stone — the player can read the mechanic from the floor alone.
          ctx.fillStyle = '#6b4a2a';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(px, py + TILE / 2 - 1, TILE, 2);
          ctx.fillRect(px, py, TILE, 1);
          ctx.fillStyle = 'rgba(255,220,160,0.14)';
          ctx.fillRect(px + 3, py + 4, TILE - 6, 2);
          ctx.fillStyle = '#2a1c10';
          ctx.beginPath();
          ctx.arc(px + 6, py + 10, 1.6, 0, Math.PI * 2);
          ctx.arc(px + TILE - 6, py + TILE - 10, 1.6, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        ctx.fillStyle = (x + y) % 2 === 0 ? base : shade(base, -7);
        ctx.fillRect(px, py, TILE, TILE);
        if (level.tint === 'gallery' || level.tint === 'crown') {
          // Marble: a faint vein across some tiles.
          if (h < 0.35) {
            ctx.strokeStyle = PALETTE.marbleVein;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px + h * TILE, py);
            ctx.lineTo(px + TILE - h * 20, py + TILE);
            ctx.stroke();
          }
          // Thin grout grid for the marble tiles.
          ctx.strokeStyle = 'rgba(0,0,0,0.18)';
          ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
        } else if (level.tint === 'office') {
          // Wood planks: grain lines + a seam every other tile.
          ctx.strokeStyle = PALETTE.woodGrain;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px, py + 12 + h * 14);
          ctx.lineTo(px + TILE, py + 10 + h * 16);
          ctx.stroke();
          if (x % 2 === 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(px, py, 1, TILE);
          }
        } else {
          // Vault steel: plate seams + a rivet on some tiles.
          ctx.strokeStyle = 'rgba(0,0,0,0.25)';
          ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
          if (h < 0.3) {
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.beginPath();
            ctx.arc(px + 5, py + 5, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        if (level.tint === 'crown' && (y === 10 || y === 11)) {
          // Maroon carpet runner down the Crown Chamber's hall, gold trim.
          ctx.fillStyle = PALETTE.carpet;
          ctx.fillRect(px, py, TILE, TILE);
          if (y === 10) {
            ctx.fillStyle = PALETTE.carpetTrim;
            ctx.fillRect(px, py, TILE, 2);
          }
          if (y === 11) {
            ctx.fillStyle = PALETTE.carpetTrim;
            ctx.fillRect(px, py + TILE - 2, TILE, 2);
          }
        }
      }
    }
  }

  function drawWalls(state) {
    const level = LEVELS[state.levelIndex];
    const goldTrim = level.tint === 'gallery' || level.tint === 'crown';
    for (let y = 0; y < level.map.length; y += 1) {
      for (let x = 0; x < level.map[y].length; x += 1) {
        if (level.map[y][x] !== '#') continue;
        ctx.fillStyle = PALETTE.wall;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        // A top-face highlight where the tile below is floor: depth.
        if (y + 1 < level.map.length && level.map[y + 1][x] !== '#') {
          ctx.fillStyle = PALETTE.wallTop;
          ctx.fillRect(x * TILE, y * TILE + TILE - 6, TILE, 6);
          if (goldTrim) {
            ctx.fillStyle = PALETTE.trimGold;
            ctx.fillRect(x * TILE, y * TILE + TILE - 8, TILE, 2);
          }
        }
        ctx.fillStyle = PALETTE.wallEdge;
        ctx.fillRect(x * TILE, y * TILE, TILE, 2);
      }
    }
  }

  function drawDecor(state) {
    const level = LEVELS[state.levelIndex];
    const decor = level.decor || { paintings: [], plants: [], lamps: [], tables: [] };
    for (const [tx, ty] of decor.paintings) {
      const cx = tx * TILE + TILE / 2;
      const cy = ty * TILE + TILE / 2;
      const h = tileHash(tx, ty);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = '#8a6d2b';
      ctx.fillRect(-14, -11, 28, 22);
      ctx.fillStyle = h < 0.5 ? '#2a4a6b' : '#6b4a2a';
      ctx.fillRect(-11, -8, 22, 16);
      ctx.fillStyle = h < 0.5 ? '#e8d27a' : '#e8e0c8';
      ctx.beginPath();
      ctx.arc(-4 + h * 8, -3, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = h < 0.5 ? '#1d3355' : '#3a5a2a';
      ctx.fillRect(-11, 2, 22, 6);
      ctx.restore();
    }
    for (const [tx, ty] of decor.tables) {
      const cx = tx * TILE + TILE / 2;
      const cy = ty * TILE + TILE / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = '#5a3a22';
      ctx.beginPath();
      ctx.roundRect(-16, -10, 32, 20, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(-8, -4, 9, 6);
      ctx.fillRect(2, 0, 8, 5);
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(-14, 12, 10, 6);
      ctx.restore();
    }
    for (const [tx, ty] of decor.plants) {
      const cx = tx * TILE + TILE + 0;
      const cy = ty * TILE + TILE / 2;
      ctx.save();
      ctx.translate(cx - TILE / 2, cy);
      ctx.fillStyle = '#8a4a2a';
      ctx.beginPath();
      ctx.moveTo(-8, 2);
      ctx.lineTo(8, 2);
      ctx.lineTo(5, 12);
      ctx.lineTo(-5, 12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#2a6b35';
      for (const [dx, dy, r] of [[-6, -6, 6], [0, -10, 7], [6, -5, 6]]) {
        ctx.beginPath();
        ctx.ellipse(dx, dy, r, r * 0.6, dx * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawLightPools(state) {
    const level = LEVELS[state.levelIndex];
    const decor = level.decor || { lamps: [] };
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [tx, ty] of decor.lamps || []) {
      const cx = tx * TILE + TILE / 2;
      const cy = (ty + 1) * TILE + TILE / 2;
      const pool = ctx.createRadialGradient(cx, cy, 10, cx, cy, 150);
      pool.addColorStop(0, 'rgba(255,196,110,0.13)');
      pool.addColorStop(1, 'rgba(255,196,110,0)');
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.arc(cx, cy, 150, 0, Math.PI * 2);
      ctx.fill();
      // The lamp fixture itself, on the wall.
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(cx - 6, ty * TILE + TILE - 12, 12, 5);
      ctx.fillStyle = 'rgba(255,220,140,0.9)';
      ctx.beginPath();
      ctx.arc(cx, ty * TILE + TILE - 6, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawVignette() {
    const grad = ctx.createRadialGradient(
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.45,
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.95,
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function drawPedestal(x, y) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + 12, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a4a58';
    ctx.fillRect(x - 9, y + 2, 18, 10);
    ctx.fillStyle = '#6a6a7a';
    ctx.fillRect(x - 9, y + 2, 18, 3);
  }

  function drawVan(state) {
    const v = state.van;
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 30, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.van;
    ctx.beginPath();
    ctx.roundRect(-28, -16, 56, 32, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(-28, -16, 56, 9);
    ctx.fillStyle = '#bfe3ff';
    ctx.fillRect(14, -11, 10, 9);
    ctx.fillStyle = '#101018';
    ctx.beginPath();
    ctx.arc(-16, 16, 6, 0, Math.PI * 2);
    ctx.arc(16, 16, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a93a3';
    ctx.beginPath();
    ctx.arc(-16, 16, 2.5, 0, Math.PI * 2);
    ctx.arc(16, 16, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(28, -8, 2.5, 0, Math.PI * 2);
    ctx.arc(28, 8, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('VAN', -4, 4);
    ctx.restore();
  }

  function drawLootShape(item, i) {
    const bob = Math.sin(stateTimeRef * 3 + i) * 2;
    ctx.save();
    ctx.translate(item.x, item.y + bob);
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
    glow.addColorStop(0, 'rgba(242,201,76,0.30)');
    glow.addColorStop(1, 'rgba(242,201,76,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();
    if (item.kind === 'painting') {
      drawPedestal(0, 6);
      ctx.fillStyle = '#8a6d2b';
      ctx.fillRect(-11, -14, 22, 17);
      ctx.fillStyle = '#2a4a6b';
      ctx.fillRect(-8, -11, 16, 11);
      ctx.fillStyle = '#e8d27a';
      ctx.beginPath();
      ctx.arc(-2, -7, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1d3355';
      ctx.fillRect(-8, -4, 16, 4);
    } else if (item.kind === 'crown') {
      drawPedestal(0, 6);
      ctx.fillStyle = PALETTE.lootGold;
      ctx.beginPath();
      ctx.moveTo(-10, 4);
      ctx.lineTo(-10, -4);
      ctx.lineTo(-5, 1);
      ctx.lineTo(0, -8);
      ctx.lineTo(5, 1);
      ctx.lineTo(10, -4);
      ctx.lineTo(10, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e5534b';
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.kind === 'artifact') {
      drawPedestal(0, 6);
      ctx.fillStyle = '#d8a93c';
      ctx.beginPath();
      ctx.arc(0, -8, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-7, 4);
      ctx.lineTo(-4, -4);
      ctx.lineTo(4, -4);
      ctx.lineTo(7, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7fe7ff';
      ctx.beginPath();
      ctx.arc(0, -8, 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.kind === 'vase') {
      drawPedestal(0, 6);
      ctx.fillStyle = '#c98a4a';
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-3, -12, 6, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(-5, -4, 2, 6);
    } else {
      const colors = [PALETTE.lootGold, PALETTE.lootPink, PALETTE.lootOrange];
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(7, 0);
      ctx.lineTo(0, 9);
      ctx.lineTo(-7, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(-2, -3, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`$${item.value}`, item.x, item.y + 24 + bob);
  }

  let stateTimeRef = 0;

  function drawLoot(state) {
    state.loot.forEach((item, i) => {
      if (item.taken) return;
      drawLootShape(item, i);
    });
  }

  function drawDiamond(state) {
    const d = state.diamond;
    if (d.taken) return;
    const pulse = 1 + Math.sin(state.time * 4) * 0.12;
    ctx.save();
    ctx.translate(d.x, d.y);
    // Stone pedestal + glass display case.
    ctx.fillStyle = '#4a4a58';
    ctx.fillRect(-11, 4, 22, 10);
    ctx.fillStyle = '#6a6a7a';
    ctx.fillRect(-11, 4, 22, 3);
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 40);
    glow.addColorStop(0, 'rgba(127,231,255,0.55)');
    glow.addColorStop(1, 'rgba(127,231,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.scale(pulse, pulse);
    ctx.fillStyle = PALETTE.diamond;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(10, 0);
    ctx.lineTo(0, 13);
    ctx.lineTo(-10, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(0, 13);
    ctx.moveTo(-10, 0);
    ctx.lineTo(10, 0);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(10, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Glass case: translucent box + diagonal shine.
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.fillStyle = 'rgba(180,220,255,0.10)';
    ctx.beginPath();
    ctx.roundRect(-17, -19, 34, 34, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,230,255,0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-17, -19, 34, 34, 4);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(-12, 10);
    ctx.lineTo(2, -16);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = PALETTE.diamond;
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('AURORA DIAMOND', d.x, d.y - 26);
  }

  function drawPanels(state) {
    for (const panel of state.panels) {
      const cam = state.cameras[panel.camera];
      const off = cam && cam.disabled > 0;
      ctx.save();
      ctx.translate(panel.x, panel.y);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 8, 11, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = off ? '#3f7a4a' : PALETTE.panel;
      ctx.beginPath();
      ctx.roundRect(-9, -9, 18, 18, 3);
      ctx.fill();
      ctx.fillStyle = off ? '#bfe3c8' : '#ffd9d6';
      ctx.beginPath();
      ctx.arc(5, -5, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('E', -1, 4);
      ctx.restore();
    }
  }

  function drawCameras(state) {
    for (const cam of state.cameras) {
      const off = cam.disabled > 0;
      if (!off) drawCone(ctx, cam.x, cam.y, cam.angle, CAMERA.range, CAMERA.halfAngle, '79,195,247');
      ctx.save();
      ctx.translate(cam.x, cam.y);
      // Wall mount + sweeping body, lens glowing cyan when live.
      ctx.fillStyle = '#2a2f42';
      ctx.fillRect(-3, -3, 6, 6);
      ctx.rotate(cam.angle);
      ctx.fillStyle = off ? '#3a3a44' : PALETTE.cameraBody;
      ctx.beginPath();
      ctx.roundRect(-2, -6, 18, 12, 5);
      ctx.fill();
      ctx.fillStyle = off ? '#55555f' : '#9fd8ff';
      ctx.beginPath();
      ctx.arc(16, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      if (!off) {
        ctx.fillStyle = 'rgba(159,216,255,0.5)';
        ctx.beginPath();
        ctx.arc(16, 0, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      if (off) {
        ctx.fillStyle = PALETTE.muted;
        ctx.font = `bold 10px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(`OFF ${Math.ceil(cam.disabled)}s`, cam.x, cam.y - 16);
      }
    }
  }

  function drawLasers(state) {
    state.lasers.forEach((lz, i) => {
      // A soft blink (sine, never a hard on/off) so the beam reads as live.
      const alpha = 0.55 + 0.35 * Math.sin(state.time * 4 + i * 1.3);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = PALETTE.laser;
      ctx.lineWidth = 3;
      ctx.shadowColor = PALETTE.laser;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(lz.x1, lz.y1);
      ctx.lineTo(lz.x2, lz.y2);
      ctx.stroke();
      ctx.restore();
      for (const [x, y] of [[lz.x1, lz.y1], [lz.x2, lz.y2]]) {
        ctx.fillStyle = '#ff8a9a';
        ctx.fillRect(x - 4, y - 4, 8, 8);
        ctx.fillStyle = `rgba(255,90,110,${0.4 + 0.4 * Math.sin(state.time * 4 + i)})`;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  /** A walking figure in a rotated frame: +x is the facing direction.
   * Legs and arms swing with walkPhase; the bob is a small vertical hop. */
  function drawFigure(x, y, angle, walkPhase, moving, drawBody) {
    const bob = moving ? Math.sin(walkPhase * 2) * 1.5 : 0;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(0, 6 - bob, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(angle);
    drawBody(walkPhase, moving);
    ctx.restore();
  }

  function drawGuards(state) {
    for (const guard of state.guards) {
      const rgb = guard.state === 'alert'
        ? '229,83,75'
        : guard.state === 'suspicious'
          ? '242,153,60'
          : '242,201,76';
      drawCone(ctx, guard.x, guard.y, guard.angle, GUARD.visionRange, GUARD.visionHalfAngle, rgb);
    }
    for (const guard of state.guards) {
      drawFigure(guard.x, guard.y, guard.angle, guard.walkPhase, guard.moving, (phase) => {
        const swing = Math.sin(phase) * 5;
        // Legs (dark trousers), swinging with the walk.
        ctx.fillStyle = '#1d3355';
        ctx.beginPath();
        ctx.arc(swing, -6, 4.5, 0, Math.PI * 2);
        ctx.arc(-swing, 6, 4.5, 0, Math.PI * 2);
        ctx.fill();
        // Arms, swinging opposite the legs.
        ctx.fillStyle = PALETTE.guard;
        ctx.beginPath();
        ctx.arc(-swing * 0.7, -11, 4, 0, Math.PI * 2);
        ctx.arc(swing * 0.7, 11, 4, 0, Math.PI * 2);
        ctx.fill();
        // Navy uniform torso + belt + brass buttons.
        ctx.fillStyle = PALETTE.guard;
        ctx.beginPath();
        ctx.ellipse(0, 0, 12, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#c9a227';
        ctx.fillRect(-2, -9, 4, 18);
        ctx.fillStyle = '#f2e6c9';
        ctx.beginPath();
        ctx.arc(0, -5, 1.4, 0, Math.PI * 2);
        ctx.arc(0, 0, 1.4, 0, Math.PI * 2);
        ctx.arc(0, 5, 1.4, 0, Math.PI * 2);
        ctx.fill();
        // Head + cap with a brim toward the facing direction.
        ctx.fillStyle = '#e8c39a';
        ctx.beginPath();
        ctx.arc(4, 0, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PALETTE.guardCap;
        ctx.beginPath();
        ctx.arc(3, 0, 7, Math.PI * 0.6, Math.PI * 1.4);
        ctx.fill();
        ctx.fillRect(8, -5, 7, 10);
        // Flashlight in the right hand: a short pale beam ahead.
        ctx.fillStyle = 'rgba(255,240,180,0.20)';
        ctx.beginPath();
        ctx.moveTo(10, 8);
        ctx.lineTo(30, 2);
        ctx.lineTo(30, 14);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff2b0';
        ctx.beginPath();
        ctx.arc(11, 9, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
      if (guard.state !== 'patrol') {
        ctx.save();
        ctx.font = `bold 24px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(10,10,18,0.85)';
        ctx.strokeText(guard.state === 'alert' ? '!' : '?', guard.x, guard.y - 24);
        ctx.fillStyle = guard.state === 'alert' ? PALETTE.red : PALETTE.gold;
        ctx.fillText(guard.state === 'alert' ? '!' : '?', guard.x, guard.y - 24);
        ctx.restore();
      }
    }
  }

  function drawThief(state) {
    const p = state.player;
    drawFigure(p.x, p.y, p.angle, p.walkPhase, p.moving, (phase) => {
      const swing = Math.sin(phase) * 5;
      // Backpack first (behind the body): grows with the loot carried.
      const carried = state.loot.filter((l) => l.taken).length + (state.diamond.taken ? 1 : 0);
      const pack = 5 + Math.min(5, carried) * 1.8;
      ctx.fillStyle = '#4a3a28';
      ctx.beginPath();
      ctx.arc(-11, 0, pack, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6b5636';
      ctx.fillRect(-13, -pack + 2, 5, pack * 1.4);
      // Legs (black trousers).
      ctx.fillStyle = '#14141c';
      ctx.beginPath();
      ctx.arc(swing, -6, 4.5, 0, Math.PI * 2);
      ctx.arc(-swing, 6, 4.5, 0, Math.PI * 2);
      ctx.fill();
      // Arms, charcoal hoodie sleeves.
      ctx.fillStyle = PALETTE.thief;
      ctx.beginPath();
      ctx.arc(-swing * 0.7, -11, 4, 0, Math.PI * 2);
      ctx.arc(swing * 0.7, 11, 4, 0, Math.PI * 2);
      ctx.fill();
      // Hoodie torso + pocket.
      ctx.fillStyle = PALETTE.thief;
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.thiefHood;
      ctx.fillRect(-4, -7, 8, 14);
      // Hood + mask: dark hood ring, pale mask with a dark eye band.
      ctx.fillStyle = PALETTE.thiefHood;
      ctx.beginPath();
      ctx.arc(4, 0, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.thiefFace;
      ctx.beginPath();
      ctx.arc(6, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#23232e';
      ctx.fillRect(5, -3.5, 5, 7);
    });
    if (p.sneak) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `bold 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('MENYELINAP', p.x, p.y - 22);
    }
  }

  function drawParticles(state) {
    for (const part of state.particles) {
      ctx.globalAlpha = Math.max(0, part.life * 2);
      ctx.fillStyle = part.color;
      ctx.beginPath();
      ctx.arc(part.x, part.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const f of state.floaters) {
      ctx.globalAlpha = Math.max(0, f.life / FLOATER_LIFE);
      ctx.font = `bold 14px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,10,18,0.9)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function nearestInteractable(state) {
    const p = state.player;
    let best = null;
    let bestDist = 36;
    const consider = (obj, kind) => {
      const d = Math.hypot(obj.x - p.x, obj.y - p.y);
      if (d < bestDist) {
        bestDist = d;
        best = { obj, kind };
      }
    };
    for (const item of state.loot) if (!item.taken) consider(item, 'loot');
    if (!state.diamond.taken) consider(state.diamond, 'diamond');
    for (const panel of state.panels) consider(panel, 'panel');
    return best;
  }

  function drawHud(state) {
    const level = LEVELS[state.levelIndex];
    const lootTaken = state.loot.filter((l) => l.taken).length;
    const lootTotal = state.loot.length;
    // Top bar: level + progress dots, objective, loot + score.
    ctx.fillStyle = 'rgba(10,13,24,0.78)';
    ctx.fillRect(0, 0, FIELD.width, 46);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`${level.name}  ${'●'.repeat(state.levelIndex + 1)}${'○'.repeat(LEVELS.length - state.levelIndex - 1)}  ·  ${Math.floor(state.elapsed)}s`, 14, 29);
    ctx.textAlign = 'center';
    ctx.font = `15px ${FONT}`;
    ctx.fillText(state.diamond.taken ? 'Diamond secured — reach the VAN!' : 'Steal the AURORA DIAMOND, then reach the VAN', FIELD.width / 2, 29);
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillText(`Loot ${lootTaken}/${lootTotal} · $${state.lootValue + (state.diamond.taken ? 1000 : 0)}  ·  score ${state.score}`, FIELD.width - 14, 29);

    // Alarm meter: segmented bar with a label and a state word, so the
    // judge reads it in one glance even when the screenshot is shrunk.
    const mw = 360;
    const mx = (FIELD.width - mw) / 2;
    const my = 56;
    ctx.fillStyle = 'rgba(10,13,24,0.78)';
    ctx.fillRect(mx - 10, my - 16, mw + 20, 38);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('ALARM', mx, my - 5);
    ctx.textAlign = 'right';
    const alarmWord = state.tripped ? `HIDE! ${Math.ceil(state.tripTimer)}s` : state.alarm > 60 ? 'TERLIHAT!' : state.alarm > 0 ? 'WASPADA' : 'TENANG';
    ctx.fillText(`${alarmWord}  ${Math.round(state.alarm)}%`, mx + mw, my - 5);
    ctx.fillStyle = '#2a3040';
    ctx.fillRect(mx, my, mw, 14);
    const frac = state.alarm / 100;
    ctx.fillStyle = state.tripped ? (Math.floor(state.time * 6) % 2 ? PALETTE.red : '#ff8a7a') : frac > 0.6 ? PALETTE.red : frac > 0.3 ? '#f2994a' : PALETTE.gold;
    ctx.fillRect(mx, my, mw * frac, 14);
    ctx.fillStyle = 'rgba(10,13,24,0.6)';
    for (let i = 1; i < 4; i += 1) ctx.fillRect(mx + (mw * i) / 4 - 1, my, 2, 14);
    if (state.tripped) {
      ctx.fillStyle = PALETTE.red;
      ctx.font = `bold 18px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('ALARM TRIPPED — BREAK LINE OF SIGHT!', FIELD.width / 2, 102);
    }

    // Bottom-left: what E does right now (or nothing, so it never lies).
    const near = nearestInteractable(state);
    if (near) {
      const label = near.kind === 'loot'
        ? `E — Ambil ${near.obj.label} ($${near.obj.value})`
        : near.kind === 'diamond'
          ? 'E — Ambil AURORA DIAMOND'
          : 'E — Potong kamera (OFF 12 dtk)';
      ctx.font = `bold 13px ${FONT}`;
      const w = ctx.measureText(label).width + 20;
      ctx.fillStyle = 'rgba(10,13,24,0.78)';
      ctx.beginPath();
      ctx.roundRect(12, FIELD.height - 34, w, 24, 12);
      ctx.fill();
      ctx.fillStyle = PALETTE.gold;
      ctx.textAlign = 'left';
      ctx.fillText(label, 22, FIELD.height - 17);
    }
    // Creaky-floor warning: a pill the player cannot miss.
    if (state.creakFlash > 0) {
      const label = 'LANTAI BERDERIT! Tahan SHIFT untuk menyelinap';
      ctx.font = `bold 13px ${FONT}`;
      const w = ctx.measureText(label).width + 20;
      ctx.fillStyle = state.creakFlash > 0.6 ? 'rgba(120,30,20,0.9)' : 'rgba(10,13,24,0.85)';
      ctx.beginPath();
      ctx.roundRect((FIELD.width - w) / 2, FIELD.height - 34, w, 24, 12);
      ctx.fill();
      ctx.fillStyle = '#ffd9a8';
      ctx.textAlign = 'left';
      ctx.fillText(label, (FIELD.width - w) / 2 + 10, FIELD.height - 17);
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `12px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText('WASD gerak · Shift menyelinap · E ambil · R ulang · M bisu', FIELD.width - 14, FIELD.height - 17);
  }

  function dim() {
    ctx.fillStyle = 'rgba(8,10,20,0.72)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function card(title, lines, accent) {
    ctx.textAlign = 'center';
    ctx.fillStyle = accent || PALETTE.text;
    ctx.font = `bold 44px ${FONT}`;
    ctx.fillText(title, FIELD.width / 2, 250);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `19px ${FONT}`;
    lines.forEach((line, i) => {
      ctx.fillText(line, FIELD.width / 2, 300 + i * 30);
    });
  }

  function draw(state, screen, best) {
    stateTimeRef = state.time;
    fit();
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // Trauma shake (game-feel): summed sines, visual only — the world
    // never moves with it, and it decays to exactly zero on its own.
    const shake = state.trauma * state.trauma;
    const t = state.time;
    const ox = shake * 10 * (0.6 * Math.sin(t * 23) + 0.4 * Math.sin(t * 41));
    const oy = shake * 8 * (0.6 * Math.sin(t * 29) + 0.4 * Math.sin(t * 47));
    ctx.save();
    ctx.translate(ox, oy);
    drawFloor(state);
    drawWalls(state);
    drawDecor(state);
    drawVan(state);
    drawLoot(state);
    drawDiamond(state);
    drawPanels(state);
    drawLasers(state);
    drawCameras(state);
    drawGuards(state);
    drawThief(state);
    drawParticles(state);
    drawLightPools(state);
    ctx.restore();
    drawVignette();
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(state);

    if (screen === SCREEN_TITLE) {
      dim();
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `bold 64px ${FONT}`;
      ctx.fillText('SILENT VAULT', FIELD.width / 2, 200);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `20px ${FONT}`;
      ctx.fillText('One thief. One museum. One legendary diamond.', FIELD.width / 2, 242);
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `bold 17px ${FONT}`;
      ctx.fillText('Baru: 4 level · lantai berderit · lukisan, mahkota & artefak emas', FIELD.width / 2, 276);
      ctx.font = `17px ${FONT}`;
      ctx.fillStyle = PALETTE.muted;
      ctx.fillText('WASD / arrows — move    Shift — sneak    E — grab / cut panel', FIELD.width / 2, 314);
      ctx.fillText('R — restart level    M — mute    P — pause', FIELD.width / 2, 340);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText('Press Enter or click to start the heist', FIELD.width / 2, 404);
      if (best > 0) {
        ctx.fillStyle = PALETTE.gold;
        ctx.font = `16px ${FONT}`;
        ctx.fillText(`Best score: ${best}`, FIELD.width / 2, 440);
      }
    } else if (screen === SCREEN_INTRO) {
      dim();
      const level = LEVELS[state.levelIndex];
      card(level.name, [level.sub, `Par time: ${level.par}s — faster means a bigger time bonus`, '', 'Press Enter to begin'], PALETTE.gold);
    } else if (screen === SCREEN_PAUSED) {
      dim();
      card('PAUSED', ['The museum waits for no one.', '', 'Press P or Enter to keep going'], PALETTE.text);
    } else if (screen === SCREEN_BUSTED) {
      dim();
      const why = state.bustedReason === 'alarm'
        ? 'The alarm countdown ran out while you were seen.'
        : 'A guard caught you red-handed.';
      card('BUSTED!', [why, `Score: ${state.score}   ·   Loot: $${state.lootValue}`, '', 'Press R to retry, Enter to try again'], PALETTE.red);
    } else if (screen === SCREEN_CLEARED) {
      dim();
      const level = LEVELS[state.levelIndex];
      const lootTaken = state.loot.filter((l) => l.taken).length;
      card(`${level.name} — CLEAR!`, [
        `Loot: $${state.lootValue} (${lootTaken}/${state.loot.length} diambil)   ·   Time bonus: $${state.timeBonus}`,
        state.ghostBonus > 0 ? `Ghost bonus (never seen): $${state.ghostBonus}` : 'Spotted along the way — no ghost bonus',
        `Score: ${state.score}`,
        '',
        'Press Enter for the next level',
      ], PALETTE.gold);
    } else if (screen === SCREEN_FINAL) {
      dim();
      card('THE HEIST IS DONE', [
        'The Aurora Diamond is yours. The van is gone before dawn.',
        `Loot: $${state.lootValue}   ·   Time bonus: $${state.timeBonus}`,
        state.ghostBonus > 0 ? `Ghost bonus (never seen): $${state.ghostBonus}` : 'Spotted along the way — no ghost bonus',
        `Final score: ${state.score}   ·   Best: ${Math.max(best, state.score)}`,
        '',
        'Press Enter to run it back',
      ], PALETTE.gold);
    }
  }

  return { draw };
}
