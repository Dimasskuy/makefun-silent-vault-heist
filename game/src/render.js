// All drawing lives here: the museum, the cones, the thief, the HUD and
// every screen. It never changes the world; it only paints the state it is
// handed. The canvas is a fixed 1280x720 logical area scaled to the window.

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
};

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

function drawCone(ctx, x, y, angle, range, halfAngle, fill) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, range, angle - halfAngle, angle + halfAngle);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
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
        if (level.map[y][x] === '#') continue;
        ctx.fillStyle = (x + y) % 2 === 0 ? base : shade(base, -8);
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }

  function drawWalls(state) {
    const level = LEVELS[state.levelIndex];
    for (let y = 0; y < level.map.length; y += 1) {
      for (let x = 0; x < level.map[y].length; x += 1) {
        if (level.map[y][x] !== '#') continue;
        ctx.fillStyle = PALETTE.wall;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        // A top-face highlight where the tile below is floor: depth.
        if (y + 1 < level.map.length && level.map[y + 1][x] !== '#') {
          ctx.fillStyle = PALETTE.wallTop;
          ctx.fillRect(x * TILE, y * TILE + TILE - 6, TILE, 6);
        }
        ctx.fillStyle = PALETTE.wallEdge;
        ctx.fillRect(x * TILE, y * TILE, TILE, 2);
      }
    }
  }

  function drawVan(state) {
    const v = state.van;
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.fillStyle = PALETTE.van;
    ctx.beginPath();
    ctx.roundRect(-26, -16, 52, 32, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(-26, -16, 52, 8);
    ctx.fillStyle = '#101018';
    ctx.beginPath();
    ctx.arc(-16, 16, 5, 0, Math.PI * 2);
    ctx.arc(16, 16, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('VAN', 0, 4);
    ctx.restore();
  }

  function drawLoot(state) {
    const colors = [PALETTE.lootGold, PALETTE.lootPink, PALETTE.lootOrange];
    state.loot.forEach((item, i) => {
      if (item.taken) return;
      const bob = Math.sin(state.time * 3 + i) * 2;
      ctx.save();
      ctx.translate(item.x, item.y + bob);
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
      ctx.restore();
    });
  }

  function drawDiamond(state) {
    const d = state.diamond;
    if (d.taken) return;
    const pulse = 1 + Math.sin(state.time * 4) * 0.12;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.scale(pulse, pulse);
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
    glow.addColorStop(0, 'rgba(127,231,255,0.55)');
    glow.addColorStop(1, 'rgba(127,231,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.diamond;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(10, 0);
    ctx.lineTo(0, 13);
    ctx.lineTo(-10, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(10, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = PALETTE.diamond;
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('AURORA DIAMOND', d.x, d.y - 24);
  }

  function drawPanels(state) {
    for (const panel of state.panels) {
      const cam = state.cameras[panel.camera];
      const off = cam && cam.disabled > 0;
      ctx.save();
      ctx.translate(panel.x, panel.y);
      ctx.fillStyle = off ? '#3f7a4a' : PALETTE.panel;
      ctx.beginPath();
      ctx.roundRect(-9, -9, 18, 18, 3);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('E', 0, 4);
      ctx.restore();
    }
  }

  function drawCameras(state) {
    for (const cam of state.cameras) {
      const off = cam.disabled > 0;
      if (!off) drawCone(ctx, cam.x, cam.y, cam.angle, CAMERA.range, CAMERA.halfAngle, PALETTE.coneCamera);
      ctx.save();
      ctx.translate(cam.x, cam.y);
      ctx.rotate(cam.angle);
      ctx.fillStyle = off ? '#3a3a44' : PALETTE.cameraBody;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = off ? '#55555f' : '#9fd8ff';
      ctx.beginPath();
      ctx.arc(6, 0, 4, 0, Math.PI * 2);
      ctx.fill();
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
    for (const lz of state.lasers) {
      ctx.save();
      ctx.strokeStyle = PALETTE.laser;
      ctx.lineWidth = 3;
      ctx.shadowColor = PALETTE.laser;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(lz.x1, lz.y1);
      ctx.lineTo(lz.x2, lz.y2);
      ctx.stroke();
      ctx.restore();
      for (const [x, y] of [[lz.x1, lz.y1], [lz.x2, lz.y2]]) {
        ctx.fillStyle = '#ff8a9a';
        ctx.fillRect(x - 4, y - 4, 8, 8);
      }
    }
  }

  function drawGuards(state) {
    for (const guard of state.guards) {
      const fill = guard.state === 'alert'
        ? PALETTE.coneGuardAlert
        : guard.state === 'suspicious'
          ? PALETTE.coneGuardSuspicious
          : PALETTE.coneGuard;
      drawCone(ctx, guard.x, guard.y, guard.angle, GUARD.visionRange, GUARD.visionHalfAngle, fill);
    }
    for (const guard of state.guards) {
      ctx.save();
      ctx.translate(guard.x, guard.y);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 4, 14, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.guard;
      ctx.beginPath();
      ctx.arc(0, 0, GUARD.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.guardCap;
      ctx.beginPath();
      ctx.arc(0, -2, 9, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-9, -3, 18, 3);
      // A nose tick so the facing is readable at a glance.
      ctx.strokeStyle = '#d8e2f2';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(guard.angle) * 12, Math.sin(guard.angle) * 12);
      ctx.stroke();
      ctx.restore();
      if (guard.state !== 'patrol') {
        ctx.fillStyle = guard.state === 'alert' ? PALETTE.red : PALETTE.gold;
        ctx.font = `bold 22px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(guard.state === 'alert' ? '!' : '?', guard.x, guard.y - 22);
      }
    }
  }

  function drawThief(state) {
    const p = state.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Backpack grows with the loot carried.
    const pack = 4 + Math.min(5, state.loot.filter((l) => l.taken).length + (state.diamond.taken ? 1 : 0)) * 1.6;
    ctx.fillStyle = '#4a3a28';
    ctx.beginPath();
    ctx.arc(-Math.cos(p.angle) * 8, -Math.sin(p.angle) * 8, pack, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.thief;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.thiefHood;
    ctx.beginPath();
    ctx.arc(Math.cos(p.angle) * 2, Math.sin(p.angle) * 2, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.thiefFace;
    ctx.beginPath();
    ctx.arc(Math.cos(p.angle) * 6, Math.sin(p.angle) * 6, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (p.sneak) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `bold 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('SNEAK', p.x, p.y - 20);
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
  }

  function drawHud(state) {
    const level = LEVELS[state.levelIndex];
    ctx.fillStyle = 'rgba(10,13,24,0.72)';
    ctx.fillRect(0, 0, FIELD.width, 44);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`${level.name}  ·  ${Math.floor(state.elapsed)}s`, 14, 28);
    ctx.textAlign = 'center';
    ctx.font = `15px ${FONT}`;
    ctx.fillText(state.diamond.taken ? 'Diamond secured — reach the VAN!' : 'Steal the AURORA DIAMOND, then reach the VAN', FIELD.width / 2, 28);
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillText(`$${state.lootValue + (state.diamond.taken ? 1000 : 0)}  ·  score ${state.score}`, FIELD.width - 14, 28);

    // Alarm meter, top centre under the bar.
    const mw = 320;
    const mx = (FIELD.width - mw) / 2;
    const my = 52;
    ctx.fillStyle = 'rgba(10,13,24,0.72)';
    ctx.fillRect(mx - 8, my - 4, mw + 16, 26);
    ctx.fillStyle = '#2a3040';
    ctx.fillRect(mx, my, mw, 14);
    const frac = state.alarm / 100;
    ctx.fillStyle = state.tripped ? (Math.floor(state.time * 6) % 2 ? PALETTE.red : '#ff8a7a') : frac > 0.6 ? PALETTE.red : PALETTE.gold;
    ctx.fillRect(mx, my, mw * frac, 14);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('ALARM', mx - 8, my - 8 + 0);
    ctx.textAlign = 'right';
    ctx.fillText(state.tripped ? `HIDE! ${Math.ceil(state.tripTimer)}s` : `${Math.round(state.alarm)}%`, mx + mw + 8, my + 11);
    if (state.tripped) {
      ctx.fillStyle = PALETTE.red;
      ctx.font = `bold 18px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('ALARM TRIPPED — BREAK LINE OF SIGHT!', FIELD.width / 2, 96);
    }
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
    fit();
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    drawFloor(state);
    drawVan(state);
    drawLoot(state);
    drawDiamond(state);
    drawPanels(state);
    drawLasers(state);
    drawCameras(state);
    drawGuards(state);
    drawThief(state);
    drawParticles(state);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(state);

    if (screen === SCREEN_TITLE) {
      dim();
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `bold 64px ${FONT}`;
      ctx.fillText('SILENT VAULT', FIELD.width / 2, 210);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `20px ${FONT}`;
      ctx.fillText('One thief. One museum. One legendary diamond.', FIELD.width / 2, 252);
      ctx.font = `17px ${FONT}`;
      ctx.fillStyle = PALETTE.muted;
      ctx.fillText('WASD / arrows — move    Shift — sneak    E — grab / cut panel', FIELD.width / 2, 310);
      ctx.fillText('R — restart level    M — mute    P — pause', FIELD.width / 2, 336);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText('Press Enter or click to start the heist', FIELD.width / 2, 400);
      if (best > 0) {
        ctx.fillStyle = PALETTE.gold;
        ctx.font = `16px ${FONT}`;
        ctx.fillText(`Best score: ${best}`, FIELD.width / 2, 436);
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
      card(`${level.name} — CLEAR!`, [
        `Loot: $${state.lootValue}   ·   Time bonus: $${state.timeBonus}`,
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

