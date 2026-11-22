// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. Everything is drawn in code — no images, no fonts from the network.
import { CAMERA, FIELD, FONT, GUARD, PALETTE, TILE } from './config.js';
import { LEVELS } from './levels.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_INTRO = 'intro';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_CLEAR = 'clear';
export const SCREEN_FINAL = 'final';

const PANEL = { width: 640, top: 118, line: 32, bottom: 64 };

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

function money(value) {
  return '$' + value.toLocaleString('en-US');
}

export function createRenderer(canvas, world) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const lootLabel = cachedLabel('LOOT ');
  const timeLabel = cachedLabel('');
  const bestLabel = cachedLabel('Best ');
  const fonts = new Map();
  let vignette = null;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
    vignette = null;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function floorColors(tint) {
    if (tint === 'office') return ['#2b2823', '#26231f'];
    if (tint === 'vault') return ['#1e2836', '#1a2330'];
    return [PALETTE.floorA, PALETTE.floorB];
  }

  function drawFloor(state) {
    const [a, b] = floorColors(state.level.floorTint);
    for (let ty = 0; ty < state.grid.length; ty += 1) {
      for (let tx = 0; tx < state.grid[ty].length; tx += 1) {
        if (state.grid[ty][tx] === '#') continue;
        context.fillStyle = (tx + ty) % 2 === 0 ? a : b;
        context.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    // A worn red carpet leads to the diamond pedestal in the vault wing.
    if (state.level.floorTint === 'vault') {
      context.fillStyle = PALETTE.carpet;
      context.fillRect(22 * TILE, 1 * TILE, 9 * TILE, 3 * TILE);
    }
  }

  function drawWalls(state) {
    for (let ty = 0; ty < state.grid.length; ty += 1) {
      for (let tx = 0; tx < state.grid[ty].length; tx += 1) {
        if (state.grid[ty][tx] !== '#') continue;
        const x = tx * TILE;
        const y = ty * TILE;
        context.fillStyle = PALETTE.wall;
        context.fillRect(x, y, TILE, TILE);
        context.fillStyle = PALETTE.wallSide;
        context.fillRect(x, y + TILE - 5, TILE, 5);
        // Top-face highlight where a floor tile sits below the wall: reads as depth.
        if (ty + 1 < state.grid.length && state.grid[ty + 1][tx] !== '#') {
          context.fillStyle = PALETTE.wallTop;
          context.fillRect(x, y + TILE - 9, TILE, 4);
        }
      }
    }
  }

  function drawVan(state) {
    const { x, y } = state.van;
    const pulse = state.diamond.taken ? 0.55 + 0.45 * Math.sin(state.elapsed * 5) : 0;
    context.save();
    context.translate(x, y);
    // Wheels.
    context.fillStyle = '#101216';
    context.beginPath();
    context.arc(-13, 12, 6, 0, Math.PI * 2);
    context.arc(13, 12, 6, 0, Math.PI * 2);
    context.fill();
    // Body.
    context.fillStyle = state.diamond.taken ? PALETTE.van : PALETTE.vanDark;
    context.beginPath();
    context.roundRect(-19, -14, 38, 26, 5);
    context.fill();
    context.fillStyle = 'rgba(238, 241, 245, 0.85)';
    context.fillRect(-19, -2, 38, 4);
    context.fillStyle = '#bcd6ff';
    context.fillRect(11, -11, 7, 9);
    context.restore();
    if (state.diamond.taken) {
      context.fillStyle = `rgba(79, 195, 247, ${0.5 + pulse * 0.5})`;
      context.beginPath();
      context.moveTo(x, y - 34 - pulse * 4);
      context.lineTo(x - 7, y - 22);
      context.lineTo(x + 7, y - 22);
      context.closePath();
      context.fill();
      text('GO!', x, y - 40, 15, '#4fc3f7', 'center');
    }
  }

  function drawDiamond(state) {
    if (state.diamond.taken) return;
    const { x, y } = state.diamond;
    const t = state.elapsed;
    const glow = 0.5 + 0.3 * Math.sin(t * 3);
    // Pedestal.
    context.fillStyle = '#4a5266';
    context.fillRect(x - 14, y - 2, 28, 16);
    context.fillStyle = '#6a7590';
    context.fillRect(x - 14, y - 2, 28, 4);
    // Glow + gem.
    const grad = context.createRadialGradient(x, y - 12, 2, x, y - 12, 34);
    grad.addColorStop(0, `rgba(127, 231, 255, ${0.55 * glow})`);
    grad.addColorStop(1, 'rgba(127, 231, 255, 0)');
    context.fillStyle = grad;
    context.beginPath();
    context.arc(x, y - 12, 34, 0, Math.PI * 2);
    context.fill();
    context.save();
    context.translate(x, y - 12);
    context.rotate(Math.PI / 4);
    context.fillStyle = PALETTE.diamond;
    context.fillRect(-8, -8, 16, 16);
    context.fillStyle = 'rgba(255, 255, 255, 0.85)';
    context.fillRect(-8, -8, 16, 5);
    context.restore();
    // Sparkles.
    for (let i = 0; i < 3; i += 1) {
      const a = t * 1.4 + (i * Math.PI * 2) / 3;
      const sx = x + Math.cos(a) * 20;
      const sy = y - 12 + Math.sin(a) * 14;
      context.fillStyle = `rgba(255, 255, 255, ${0.4 + 0.4 * Math.sin(t * 4 + i)})`;
      context.fillRect(sx - 1, sy - 4, 2, 8);
      context.fillRect(sx - 4, sy - 1, 8, 2);
    }
    text('AURORA DIAMOND', x, y + 34, 12, PALETTE.diamond, 'center');
  }

  function drawLoot(state) {
    state.loot.forEach((item, index) => {
      if (item.taken) return;
      const bob = Math.sin(state.elapsed * 2 + index) * 2;
      const kind = index % 3;
      context.save();
      context.translate(item.x, item.y + bob);
      if (kind === 0) {
        // Gold bars.
        context.fillStyle = PALETTE.lootGold;
        context.fillRect(-11, -4, 22, 8);
        context.fillStyle = '#c9a227';
        context.fillRect(-11, 0, 22, 4);
      } else if (kind === 1) {
        // Vase.
        context.fillStyle = PALETTE.lootArt;
        context.beginPath();
        context.ellipse(0, 0, 8, 11, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#8a5aa0';
        context.fillRect(-4, -14, 8, 5);
      } else {
        // Framed painting.
        context.fillStyle = '#7a5a2e';
        context.fillRect(-12, -10, 24, 20);
        context.fillStyle = '#3f7d8c';
        context.fillRect(-9, -7, 18, 14);
        context.fillStyle = '#e8b23a';
        context.beginPath();
        context.arc(0, 0, 4, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
      text(money(item.value), item.x, item.y + 26, 11, PALETTE.lootGold, 'center');
    });
  }

  function drawPanels(state) {
    for (const panel of state.panels) {
      const camera = state.cameras[panel.cameraIndex];
      const off = camera && camera.disabled > 0;
      context.fillStyle = off ? '#3a4a3a' : '#5a3a3a';
      context.fillRect(panel.x - 10, panel.y - 10, 20, 20);
      context.fillStyle = off ? '#7dff9a' : (Math.sin(state.elapsed * 4) > 0 ? '#ff5a4a' : '#a33');
      context.beginPath();
      context.arc(panel.x, panel.y, 4, 0, Math.PI * 2);
      context.fill();
      text('PANEL', panel.x, panel.y + 26, 10, PALETTE.muted, 'center');
    }
  }

  function drawLasers(state) {
    for (const laser of state.lasers) {
      const dx = laser.x2 - laser.x1;
      const dy = laser.y2 - laser.y1;
      const len = Math.hypot(dx, dy);
      const nx = -dy / len;
      const ny = dx / len;
      context.strokeStyle = 'rgba(255, 59, 92, 0.25)';
      context.lineWidth = 7;
      context.beginPath();
      context.moveTo(laser.x1, laser.y1);
      context.lineTo(laser.x2, laser.y2);
      context.stroke();
      context.strokeStyle = PALETTE.laser;
      context.lineWidth = 2;
      context.setLineDash([10, 8]);
      context.lineDashOffset = -state.elapsed * 30;
      context.beginPath();
      context.moveTo(laser.x1, laser.y1);
      context.lineTo(laser.x2, laser.y2);
      context.stroke();
      context.setLineDash([]);
      // Emitters.
      for (const [ex, ey] of [[laser.x1, laser.y1], [laser.x2, laser.y2]]) {
        context.fillStyle = '#ff8ba0';
        context.beginPath();
        context.arc(ex, ey, 4, 0, Math.PI * 2);
        context.fill();
      }
      void nx;
      void ny;
    }
  }

  function drawCone(points, color) {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) context.lineTo(points[i].x, points[i].y);
    context.closePath();
    context.fill();
  }

  function drawCameras(state) {
    for (const camera of state.cameras) {
      const off = camera.disabled > 0;
      if (!off) {
        const points = world.conePolygon(camera.x, camera.y, camera.angle, camera.range, CAMERA.halfAngle);
        drawCone(points, PALETTE.coneCamera);
      }
      context.save();
      context.translate(camera.x, camera.y);
      context.rotate(camera.angle);
      context.fillStyle = off ? '#4a5058' : PALETTE.cameraBody;
      context.beginPath();
      context.roundRect(-4, -7, 22, 14, 4);
      context.fill();
      context.fillStyle = off ? '#333' : '#20242e';
      context.beginPath();
      context.arc(18, 0, 5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = off ? '#555' : '#7fe7ff';
      context.beginPath();
      context.arc(19, 0, 2.5, 0, Math.PI * 2);
      context.fill();
      context.restore();
      // Mount.
      context.fillStyle = '#3a3f4a';
      context.fillRect(camera.x - 3, camera.y - 3, 6, 6);
      if (off) text(`OFF ${Math.ceil(camera.disabled)}s`, camera.x, camera.y - 20, 12, '#7dff9a', 'center');
    }
  }

  function drawGuards(state) {
    for (const guard of state.guards) {
      const color = guard.state === 'alert' ? PALETTE.coneAlert : guard.state === 'suspicious' ? PALETTE.coneSuspicious : PALETTE.conePatrol;
      const points = world.conePolygon(guard.x, guard.y, guard.angle, 232, 0.55);
      drawCone(points, color);
    }
    for (const guard of state.guards) {
      context.save();
      context.translate(guard.x, guard.y);
      // Soft shadow.
      context.fillStyle = 'rgba(0, 0, 0, 0.35)';
      context.beginPath();
      context.ellipse(2, 10, 13, 6, 0, 0, Math.PI * 2);
      context.fill();
      // Body.
      context.fillStyle = PALETTE.guard;
      context.beginPath();
      context.arc(0, 0, GUARD.radius, 0, Math.PI * 2);
      context.fill();
      // Cap.
      context.fillStyle = PALETTE.guardCap;
      context.beginPath();
      context.arc(Math.cos(guard.angle) * 3, Math.sin(guard.angle) * 3 - 2, 8, 0, Math.PI * 2);
      context.fill();
      // Facing tick.
      context.strokeStyle = '#dfe6f2';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(Math.cos(guard.angle) * 8, Math.sin(guard.angle) * 8);
      context.lineTo(Math.cos(guard.angle) * 15, Math.sin(guard.angle) * 15);
      context.stroke();
      context.restore();
      if (guard.state === 'suspicious') {
        text('?', guard.x, guard.y - 22, 22, '#f28c3c', 'center');
      } else if (guard.state === 'alert') {
        text('!', guard.x, guard.y - 22, 24, '#e5534b', 'center');
      }
    }
  }

  function drawThief(state) {
    const player = state.player;
    const r = player.sneak ? 11 : 13;
    context.save();
    context.translate(player.x, player.y);
    // Shadow.
    context.fillStyle = 'rgba(0, 0, 0, 0.4)';
    context.beginPath();
    context.ellipse(2, 10, 12, 5, 0, 0, Math.PI * 2);
    context.fill();
    // Backpack grows with the haul.
    const pack = 5 + Math.min(9, state.lootTaken * 2) + (state.diamond.taken ? 3 : 0);
    context.fillStyle = '#3a2f22';
    context.fillRect(-Math.cos(player.angle) * 8 - pack / 2, -Math.sin(player.angle) * 8 - pack / 2, pack, pack);
    // Hoodie body.
    context.fillStyle = PALETTE.thief;
    context.beginPath();
    context.arc(0, 0, r, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = PALETTE.thiefTrim;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, r, player.angle - 0.9, player.angle + 0.9);
    context.stroke();
    // Mask + eyes, facing the move direction.
    context.fillStyle = '#dfe6f2';
    context.beginPath();
    context.arc(Math.cos(player.angle) * 6, Math.sin(player.angle) * 6, 4.5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#14161c';
    context.beginPath();
    context.arc(Math.cos(player.angle) * 7.5 - Math.sin(player.angle) * 2, Math.sin(player.angle) * 7.5 + Math.cos(player.angle) * 2, 1.2, 0, Math.PI * 2);
    context.arc(Math.cos(player.angle) * 7.5 + Math.sin(player.angle) * 2, Math.sin(player.angle) * 7.5 - Math.cos(player.angle) * 2, 1.2, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function nearestInteractable(state) {
    const player = state.player;
    let best = null;
    let bestDist = Infinity;
    for (const item of state.loot) {
      if (item.taken) continue;
      const d = Math.hypot(item.x - player.x, item.y - player.y);
      if (d < 40 && d < bestDist) {
        best = { label: `E — Grab loot ${money(item.value)}`, dist: d };
        bestDist = d;
      }
    }
    if (!state.diamond.taken) {
      const d = Math.hypot(state.diamond.x - player.x, state.diamond.y - player.y);
      if (d < 50 && d < bestDist) {
        best = { label: 'E — Take the Aurora Diamond', dist: d };
        bestDist = d;
      }
    }
    for (const panel of state.panels) {
      const camera = state.cameras[panel.cameraIndex];
      if (!camera || camera.disabled > 0) continue;
      const d = Math.hypot(panel.x - player.x, panel.y - player.y);
      if (d < 52 && d < bestDist) {
        best = { label: 'E — Disable camera (12s)', dist: d };
        bestDist = d;
      }
    }
    return best;
  }

  function alarmColor(alarm) {
    if (alarm >= 70) return PALETTE.alarmHigh;
    if (alarm >= 35) return PALETTE.alarmMid;
    return PALETTE.alarmLow;
  }

  function drawHud(state, info) {
    // Top strip.
    context.fillStyle = 'rgba(11, 14, 20, 0.85)';
    context.fillRect(0, 0, FIELD.width, 52);
    text(lootLabel(state.lootValue + (state.diamond.taken ? 1000 : 0)), 20, 33, 24, PALETTE.lootGold, 'left');
    text(state.diamond.taken ? '◆ DIAMOND SECURED' : '◆ STEAL THE DIAMOND', 300, 33, 18, state.diamond.taken ? PALETTE.diamond : PALETTE.text, 'left');
    text(state.level.name, FIELD.width / 2, 33, 20, PALETTE.text, 'center');
    const mins = Math.floor(state.elapsed / 60);
    const secs = Math.floor(state.elapsed % 60);
    text(timeLabel(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`), FIELD.width - 20, 33, 22, PALETTE.text, 'right');

    // Alarm meter.
    const barX = 20;
    const barY = 62;
    const barW = FIELD.width - 40;
    const barH = 18;
    context.fillStyle = 'rgba(11, 14, 20, 0.85)';
    context.fillRect(barX - 6, barY - 20, barW + 12, barH + 28);
    text('ALARM', barX, barY - 4, 13, PALETTE.muted, 'left');
    context.fillStyle = '#20242e';
    context.fillRect(barX, barY, barW, barH);
    context.fillStyle = alarmColor(state.alarm);
    context.fillRect(barX, barY, (barW * state.alarm) / 100, barH);
    context.strokeStyle = state.tripped && Math.sin(state.elapsed * 10) > 0 ? '#ff5a4a' : '#4a5058';
    context.lineWidth = 2;
    context.strokeRect(barX, barY, barW, barH);
    if (state.tripped) {
      text(`HIDE! ${Math.max(0, state.tripTimer).toFixed(1)}s`, barX + barW + 0, barY - 4, 13, '#ff5a4a', 'right');
    } else if (state.alarm > 0) {
      text(`${Math.round(state.alarm)}%`, barX + barW, barY - 4, 13, alarmColor(state.alarm), 'right');
    }

    // Objective line.
    const objective = state.diamond.taken
      ? 'Objective: reach the getaway van — do not get caught'
      : 'Objective: steal the Aurora Diamond, grab loot, reach the van';
    text(objective, 20, 112, 15, PALETTE.muted, 'left');
    if (state.player.sneak) text('SNEAKING', FIELD.width - 20, 112, 15, '#4fc3f7', 'right');
    if (info.muted) text('MUTED (M)', FIELD.width - 20, 136, 13, PALETTE.muted, 'right');

    // Interact prompt.
    const near = nearestInteractable(state);
    if (near) {
      const label = near.label;
      context.font = `16px ${FONT}`;
      const w = context.measureText(label).width + 28;
      context.fillStyle = 'rgba(11, 14, 20, 0.88)';
      context.beginPath();
      context.roundRect((FIELD.width - w) / 2, FIELD.height - 52, w, 34, 17);
      context.fill();
      text(label, FIELD.width / 2, FIELD.height - 29, 16, PALETTE.lootGold, 'center');
    }
  }

  function drawVignette() {
    if (!vignette) {
      vignette = context.createRadialGradient(
        FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.45,
        FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.85,
      );
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
    }
    context.fillStyle = vignette;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function drawPanel(title, lines, prompt, accent) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(11, 14, 20, 0.92)';
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = accent || PALETTE.thiefTrim;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 76, 46, accent || PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 20, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 34, 20, PALETTE.lootGold, 'center');
  }

  function drawField(state) {
    drawFloor(state);
    drawVan(state);
    drawDiamond(state);
    drawLoot(state);
    drawPanels(state);
    drawLasers(state);
    drawCameras(state);
    drawGuards(state);
    drawThief(state);
    drawWalls(state);
    drawVignette();
  }

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, info) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawField(state);
    if (screen === SCREEN_TITLE) {
      const lines = [
        'One thief. One museum. One legendary diamond.',
        'Dodge the guard cones, slip past the cameras,',
        'lift the Aurora Diamond and reach the van.',
        '',
        'Move WASD / arrows · SHIFT sneak · E interact · R restart · M mute',
        bestLabel(info.best),
      ];
      drawPanel('SILENT VAULT', lines, 'Press Enter or click to start', PALETTE.thiefTrim);
      return;
    }
    drawHud(state, info);
    if (screen === SCREEN_INTRO) {
      const lines = [
        state.level.sub,
        '',
        `Par time ${state.level.par}s · Loot on this floor: ${state.loot.length} pieces`,
        state.level.lasers.length ? 'Lasers trip the alarm instantly — cross them only if you must.' : 'Watch the cones: amber patrol, orange suspicious, red alert.',
      ];
      drawPanel(state.level.name, lines, 'Press Enter to begin the heist', PALETTE.diamond);
    } else if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The guards will wait for you.'], 'Press P to resume', PALETTE.text);
    } else if (screen === SCREEN_BUSTED) {
      const reason = state.bustedReason === 'alarm'
        ? 'The alarm countdown ran out while you were still seen.'
        : 'A guard caught you in the open.';
      const lines = [
        reason,
        '',
        `Loot ${money(state.lootValue)} · Score ${money(state.score)}`,
        bestLabel(info.best),
      ];
      drawPanel('BUSTED!', lines, 'Press R to retry — Enter for the title', '#e5534b');
    } else if (screen === SCREEN_CLEAR) {
      const lines = [
        `Loot ${money(state.lootValue)}  +  Diamond $1,000`,
        `Time bonus ${money(state.timeBonus)}  ·  Ghost bonus ${money(state.ghostBonus)}`,
        '',
        `Level score ${money(state.score)}`,
      ];
      const last = state.levelIndex + 1 >= LEVELS.length;
      drawPanel(last ? 'THE VAULT IS YOURS' : 'CLEAN GETAWAY!', lines, last ? 'Press Enter for the heist report' : 'Press Enter for the next floor', PALETTE.diamond);
    } else if (screen === SCREEN_FINAL) {
      const lines = [
        `Total loot ${money(info.totalLoot)}  ·  Total score ${money(info.totalScore)}`,
        `Best ${money(info.best)}`,
        '',
        'The Aurora Diamond is gone. The museum never saw a thing.',
      ];
      drawPanel('THE PERFECT HEIST', lines, 'Press Enter for the title', PALETTE.thiefTrim);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
