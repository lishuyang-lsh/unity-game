const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreNode = document.getElementById("score");
const livesNode = document.getElementById("lives");
const levelNode = document.getElementById("level");
const messageNode = document.getElementById("message");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");

let width = window.innerWidth;
let height = window.innerHeight;

const keys = new Set();
const mouse = { isDown: false };

const PLAYER_LANE_OFFSET = 90;

function getPlayerLaneY() {
  return height - PLAYER_LANE_OFFSET;
}

function getPlayerYMin() {
  return height * 0.22;
}

function getPlayerYMax() {
  return height - PLAYER_LANE_OFFSET * 0.35;
}

function clampPlayerPosition() {
  player.x = Math.max(player.w / 2, Math.min(width - player.w / 2, player.x));
  player.y = Math.max(getPlayerYMin(), Math.min(getPlayerYMax(), player.y));
}

const state = {
  started: false,
  running: true,
  score: 0,
  hp: 100,
  maxHp: 100,
  level: 1,
  elapsed: 0,
  enemySpawnTimer: 0,
  chestSpawnTimer: 0,
  stars: [],
  playerBullets: [],
  enemies: [],
  enemyBullets: [],
  chests: [],
  effects: [],
  cameraShake: 0,
  clouds: [],
  buildingColliders: []
};

const player = {
  x: width / 2,
  y: height - PLAYER_LANE_OFFSET,
  w: 28,
  h: 36,
  speed: 300,
  shootCooldown: 0.15,
  shootTimer: 0,
  buffs: {
    tripleBurst: 0,
    spread: 0,
    missile: 0,
    nuke: 0
  },
  burstShotsRemaining: 0,
  burstShotTimer: 0,
  velX: 0,
  smoothVelX: 0,
  velY: 0,
  smoothVelY: 0,
  prevX: width / 2,
  prevY: height - PLAYER_LANE_OFFSET
};

function resizeCanvas() {
  width = Math.max(320, window.innerWidth);
  height = Math.max(480, window.innerHeight);
  canvas.width = width;
  canvas.height = height;

  clampPlayerPosition();

  if (typeof PacificBattleBG !== "undefined" && PacificBattleBG.isReady && PacificBattleBG.isReady()) {
    PacificBattleBG.setSize(width, height);
  }
}

const CHEST_NAMES = {
  tripleBurst: "三连发",
  spread: "三向散射",
  missile: "导弹",
  nuke: "核弹",
  heal: "加血"
};

const ENEMY_MODELS = {
  normal: ["F-16", "F-5E", "MiG-21", "Mirage 2000"],
  heavy: ["Su-27", "F/A-18", "J-11", "F-14"],
  boss: ["F-22", "Su-57", "J-16", "F-15EX"]
};

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function resetGame() {
  state.running = true;
  state.score = 0;
  state.hp = state.maxHp;
  state.level = 1;
  state.elapsed = 0;
  state.enemySpawnTimer = 0;
  state.chestSpawnTimer = random(6, 10);
  state.playerBullets = [];
  state.enemies = [];
  state.enemyBullets = [];
  state.chests = [];
  state.effects = [];
  state.cameraShake = 0;
  state.stars = [];
  state.clouds = [];

  player.x = width / 2;
  player.y = getPlayerLaneY();
  player.prevX = player.x;
  player.prevY = player.y;
  player.velX = 0;
  player.velY = 0;
  player.smoothVelX = 0;
  player.smoothVelY = 0;
  player.shootTimer = 0;
  player.buffs.tripleBurst = 0;
  player.buffs.spread = 0;
  player.buffs.missile = 0;
  player.buffs.nuke = 0;
  player.burstShotsRemaining = 0;
  player.burstShotTimer = 0;

  messageNode.textContent = "当前效果: 普通子弹";
  restartBtn.style.display = "none";
  if (state.started && typeof GameAudio !== "undefined") {
    GameAudio.init().then(() => GameAudio.startAmbience());
  }
  if (state.started) {
    document.body.classList.add("playing");
  }
  updateHud();
}

function startGame() {
  state.started = true;
  startBtn.style.display = "none";
  document.body.classList.add("playing");
  resetGame();
}

function updateHud() {
  scoreNode.textContent = `分数: ${state.score}`;
  livesNode.textContent = `血量: ${state.hp}`;
  levelNode.textContent = `等级: ${state.level}`;
}

function refreshBuildingColliders() {
  if (typeof PacificBattleBG !== "undefined" && PacificBattleBG.getBuildingColliders) {
    state.buildingColliders = PacificBattleBG.getBuildingColliders(width, height, state.elapsed);
  } else {
    state.buildingColliders = [];
  }
}

function collidesAnyBuilding(entity) {
  for (const b of state.buildingColliders) {
    if (rectOverlap(entity, b)) {
      return true;
    }
  }
  return false;
}

function resolveBuildingCollision(entity, options = {}) {
  const horizontalOnly = options.horizontalOnly === true;
  for (const b of state.buildingColliders) {
    if (!rectOverlap(entity, b)) {
      continue;
    }
    const dx = entity.x - b.x;
    const dy = entity.y - b.y;
    const overlapX = (entity.w + b.w) * 0.5 - Math.abs(dx);
    const overlapY = (entity.h + b.h) * 0.5 - Math.abs(dy);
    if (overlapX <= 0 || overlapY <= 0) {
      continue;
    }
    if (horizontalOnly || overlapX <= overlapY) {
      entity.x += (dx >= 0 ? 1 : -1) * (overlapX + 1.5);
    } else {
      entity.y += (dy >= 0 ? 1 : -1) * (overlapY + 1.5);
    }
  }
}

function applyBuildingAvoidance(enemy, dt) {
  if (!state.buildingColliders.length) {
    return;
  }

  let steer = 0;
  let steerY = 0;
  const sense = enemy.type === "boss" ? 70 : 55;
  const senseY = enemy.type === "boss" ? 58 : 48;
  const lookAhead = enemy.h * 0.65;

  for (const b of state.buildingColliders) {
    const dy = enemy.y - b.y;
    if (dy > b.h * 0.55 + lookAhead || dy < -b.h * 0.55 - 20) {
      continue;
    }

    const dx = enemy.x - b.x;
    const minGap = (enemy.w + b.w) * 0.48;
    const distX = Math.abs(dx) - minGap;
    if (distX <= sense) {
      const urgency = 1 - Math.max(0, distX) / sense;
      steer += (dx >= 0 ? 1 : -1) * urgency * urgency;
    }

    const minGapY = (enemy.h + b.h) * 0.46;
    const distY = Math.abs(dy) - minGapY;
    if (Math.abs(dx) < b.w * 0.55 && distY < senseY) {
      const urgencyY = 1 - Math.max(0, distY) / senseY;
      steerY += (dy >= 0 ? 1 : -1) * urgencyY * urgencyY;
    }
  }

  const path = enemy.path;
  const forceBase = enemy.type === "boss" ? 105 : enemy.type === "heavy" ? 135 : 165;

  if (Math.abs(steer) >= 0.05) {
    const force = forceBase * Math.sign(steer);
    enemy.x += force * dt * Math.min(1.2, Math.abs(steer));
    if (path) {
      path.vx = force * 0.72;
      path.sweepDir = force > 0 ? 1 : -1;
      path.avoidUntil = state.elapsed + 0.55;
      if (path.pathType === "weave" || path.pathType === "orbit") {
        path.baseX = enemy.x;
        path.weaveAmp = Math.max(18, path.weaveAmp * 0.85);
      }
    }
  }

  if (Math.abs(steerY) >= 0.05) {
    const forceY = (forceBase * 0.85) * Math.sign(steerY);
    enemy.y += forceY * dt * Math.min(1.2, Math.abs(steerY));
    if (path) {
      path.vy = forceY * 0.65;
    }
  }
}

function pickSpawnX(enemyW, enemyH) {
  refreshBuildingColliders();
  for (let i = 0; i < 16; i += 1) {
    const x = random(enemyW / 2 + 16, width - enemyW / 2 - 16);
    const probe = { x, y: -30, w: enemyW, h: enemyH };
    if (!collidesAnyBuilding(probe)) {
      return x;
    }
  }
  return width / 2;
}

function createEnemyPath(type) {
  const paths = type === "boss"
    ? ["orbit", "sweep", "weave"]
    : type === "heavy"
      ? ["weave", "sweep", "drift"]
      : ["weave", "zigzag", "drift"];
  const pathType = paths[Math.floor(Math.random() * paths.length)];
  return {
    pathType,
    phase: random(0, Math.PI * 2),
    weaveAmp: type === "boss" ? random(55, 95) : type === "heavy" ? random(35, 65) : random(22, 48),
    weaveFreq: random(1.1, 2.6),
    verticalAmp: type === "boss" ? random(38, 68) : type === "heavy" ? random(28, 52) : random(18, 38),
    verticalFreq: random(0.85, 1.9),
    vx: random(-55, 55),
    vy: random(-40, 40),
    sweepDir: Math.random() < 0.5 ? -1 : 1,
    prevX: null,
    prevY: null,
    tilt: 0
  };
}

function createEnemyShootProfile(type) {
  if (type === "boss") {
    return {
      mode: Math.random() < 0.35 ? "spread" : "burst",
      burstSize: Math.floor(random(4, 7)),
      burstGap: random(0.1, 0.18),
      reloadMin: random(1.4, 2.2),
      reloadMax: random(2.6, 3.6),
      burstRemaining: 0,
      burstTimer: random(0.6, 1.4),
      aimLead: 0.42
    };
  }
  if (type === "heavy") {
    return {
      mode: "burst",
      burstSize: Math.floor(random(2, 4)),
      burstGap: random(0.16, 0.28),
      reloadMin: random(1.6, 2.4),
      reloadMax: random(2.8, 3.8),
      burstRemaining: 0,
      burstTimer: random(0.9, 2.0),
      aimLead: 0.25
    };
  }
  return {
    mode: Math.random() < 0.25 ? "burst" : "single",
    burstSize: 2,
    burstGap: random(0.14, 0.24),
    reloadMin: random(2.0, 3.0),
    reloadMax: random(3.5, 5.0),
    burstRemaining: 0,
    burstTimer: random(1.2, 2.8),
    aimLead: 0.12
  };
}

function spawnEnemy() {
  let enemyType = "normal";
  const bossChance = Math.min(0.2, 0.02 + state.level * 0.01);
  if (Math.random() < bossChance) {
    enemyType = "boss";
  } else if (Math.random() < 0.15 + state.level * 0.02) {
    enemyType = "heavy";
  }
  const x = pickSpawnX(
    enemyType === "boss" ? 52 : enemyType === "heavy" ? 38 : 30,
    enemyType === "boss" ? 60 : enemyType === "heavy" ? 44 : 34
  );
  const enemy = {
    x,
    y: -30,
    w: enemyType === "boss" ? 52 : enemyType === "heavy" ? 38 : 30,
    h: enemyType === "boss" ? 60 : enemyType === "heavy" ? 44 : 34,
    speed: enemyType === "boss" ? random(50, 68) : enemyType === "heavy" ? random(62, 88) : random(95, 140),
    speedBase: 0,
    hp: enemyType === "boss" ? 10 : enemyType === "heavy" ? 4 : 1,
    type: enemyType,
    model: ENEMY_MODELS[enemyType][Math.floor(Math.random() * ENEMY_MODELS[enemyType].length)],
    path: null,
    shoot: null
  };
  enemy.speedBase = enemy.speed;
  enemy.path = createEnemyPath(enemyType);
  enemy.path.baseX = x;
  enemy.path.baseY = enemy.y;
  enemy.path.prevX = x;
  enemy.path.prevY = enemy.y;
  enemy.shoot = createEnemyShootProfile(enemyType);
  state.enemies.push(enemy);
}

function clampEnemyAltitude(enemy) {
  const yMin = 24;
  const yMax = height * 0.94;
  const path = enemy.path;
  if (enemy.y < yMin) {
    enemy.y = yMin;
    if (path) {
      path.vy = Math.abs(path.vy || 35);
    }
  } else if (enemy.y > yMax) {
    enemy.y = yMax;
    if (path) {
      path.vy = -Math.abs(path.vy || 35);
    }
  }
}

function updateEnemyMovement(enemy, dt) {
  const path = enemy.path;
  if (!path) {
    enemy.y += enemy.speed * dt;
    return;
  }

  path.phase += dt * path.weaveFreq;
  const throttle = 1 + Math.sin(state.elapsed * 1.1 + path.phase) * (enemy.type === "boss" ? 0.1 : 0.14);
  const speed = enemy.speedBase * throttle;
  const margin = enemy.w / 2 + 12;
  const yMin = 24;
  const yMax = height * 0.94;

  enemy.y += speed * dt * 0.62;

  switch (path.pathType) {
    case "weave":
      enemy.x = path.baseX + Math.sin(path.phase) * path.weaveAmp;
      enemy.y += Math.sin(path.phase * path.verticalFreq) * path.verticalAmp * 0.55 * dt;
      enemy.y += path.vy * 0.35 * dt;
      break;
    case "zigzag":
      enemy.x += path.vx * dt;
      enemy.y += path.vy * dt;
      if (enemy.x <= margin || enemy.x >= width - margin) {
        path.vx *= -1;
        enemy.x = Math.max(margin, Math.min(width - margin, enemy.x));
      }
      if (Math.sin(path.phase * 2.2) > 0.92) {
        path.vx = Math.sign(path.vx || 1) * random(70, 120) * (Math.random() < 0.5 ? -1 : 1);
        path.vy = Math.sign(path.vy || 1) * random(45, 95) * (Math.random() < 0.5 ? -1 : 1);
      }
      break;
    case "sweep":
      enemy.x += path.vx * dt;
      enemy.y += path.vy * 0.75 * dt + Math.sin(path.phase * 1.3) * path.verticalAmp * 0.35 * dt;
      path.vx += path.sweepDir * 45 * dt;
      if (enemy.x <= margin) {
        enemy.x = margin;
        path.sweepDir = 1;
        path.vx = Math.abs(path.vx) * 0.6;
      } else if (enemy.x >= width - margin) {
        enemy.x = width - margin;
        path.sweepDir = -1;
        path.vx = -Math.abs(path.vx) * 0.6;
      }
      if (enemy.y <= yMin + 20 || enemy.y >= yMax - 30) {
        path.vy *= -1;
      }
      break;
    case "drift": {
      let toPlayer = (player.x - enemy.x) * 0.28;
      let toPlayerY = (player.y - enemy.y) * 0.2;
      for (const b of state.buildingColliders) {
        const nearY = Math.abs(enemy.y - b.y) < b.h * 0.5 + enemy.h * 0.5;
        const nearX = Math.abs(enemy.x - b.x) < b.w * 0.55;
        if (nearY && nearX) {
          toPlayer = (enemy.x - b.x) >= 0 ? 0.55 : -0.55;
          toPlayerY = (enemy.y - b.y) >= 0 ? 0.35 : -0.35;
          break;
        }
      }
      enemy.x += (toPlayer + Math.sin(path.phase * 1.4) * 38) * dt;
      enemy.y += (toPlayerY + Math.cos(path.phase * 1.1) * 32) * dt;
      break;
    }
    case "orbit":
      enemy.x = path.baseX + Math.sin(path.phase) * path.weaveAmp;
      enemy.y += Math.sin(path.phase * 0.65) * path.verticalAmp * 0.5 * dt + path.vy * 0.3 * dt;
      break;
    default:
      break;
  }

  clampEnemyAltitude(enemy);

  enemy.x = Math.max(margin, Math.min(width - margin, enemy.x));
  applyBuildingAvoidance(enemy, dt);
  resolveBuildingCollision(enemy);
  clampEnemyAltitude(enemy);
  enemy.x = Math.max(margin, Math.min(width - margin, enemy.x));

  if (path.prevX !== null) {
    path.tilt = Math.max(-0.22, Math.min(0.22, (enemy.x - path.prevX) / Math.max(dt, 0.001) * 0.0025));
  }
  path.prevX = enemy.x;
  path.prevY = enemy.y;
  enemy.tilt = path.tilt;
}

function enemyInShootRange(enemy) {
  if (enemy.y < 50 || enemy.y > player.y - 30) {
    return false;
  }
  if (enemy.type === "boss") {
    return true;
  }
  const align = Math.abs(enemy.x - player.x);
  return align < width * (enemy.type === "heavy" ? 0.55 : 0.42);
}

function shootEnemyBullet(enemy, profile) {
  const baseSpeed = (enemy.type === "boss" ? 210 : enemy.type === "heavy" ? 195 : 175) + state.level * 7;
  const dy = Math.max(80, player.y - enemy.y);
  const travelTime = dy / baseSpeed;
  const lead = profile ? profile.aimLead : 0.1;
  const predictedX = player.x + (player.velX || 0) * travelTime * lead;
  const predictedY = player.y + (player.velY || 0) * travelTime * lead * 0.45;
  const dx = predictedX - enemy.x;
  const aimDy = Math.max(40, predictedY - enemy.y);
  const dist = Math.hypot(dx, aimDy) || 1;
  const vx = (dx / dist) * baseSpeed * (enemy.type === "boss" ? 0.45 : enemy.type === "heavy" ? 0.36 : 0.28);
  const vy = (aimDy / dist) * baseSpeed;

  state.enemyBullets.push({
    x: enemy.x + random(-2, 2),
    y: enemy.y + enemy.h / 2,
    vx,
    vy,
    r: enemy.type === "boss" ? 5 : enemy.type === "heavy" ? 4 : 3,
    damage: enemy.type === "boss" ? 50 : 20
  });
}

function shootEnemySpread(enemy, profile) {
  const baseSpeed = 200 + state.level * 7;
  const dy = Math.max(80, player.y - enemy.y);
  const travelTime = dy / baseSpeed;
  const lead = profile ? profile.aimLead : 0.35;
  const predictedX = player.x + (player.velX || 0) * travelTime * lead;
  const predictedY = player.y + (player.velY || 0) * travelTime * lead * 0.45;
  const dx = predictedX - enemy.x;
  const aimDy = Math.max(40, predictedY - enemy.y);
  const dist = Math.hypot(dx, aimDy) || 1;
  const aimAngle = Math.atan2(dx, aimDy);
  const spread = enemy.type === "boss" ? 0.55 : 0.38;
  const count = enemy.type === "boss" ? 5 : 3;

  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * 2;
    const angle = aimAngle + t * spread;
    state.enemyBullets.push({
      x: enemy.x,
      y: enemy.y + enemy.h / 2,
      vx: Math.sin(angle) * baseSpeed * 0.48,
      vy: Math.cos(angle) * baseSpeed,
      r: 5,
      damage: 50
    });
  }
}

function updateEnemyShooting(enemy, dt) {
  const profile = enemy.shoot;
  if (!profile) {
    return;
  }

  profile.burstTimer -= dt;
  if (profile.burstTimer > 0) {
    return;
  }

  if (profile.burstRemaining > 0) {
    if (enemyInShootRange(enemy)) {
      shootEnemyBullet(enemy, profile);
    }
    profile.burstRemaining -= 1;
    profile.burstTimer = profile.burstGap;
    if (profile.burstRemaining <= 0) {
      profile.burstTimer = random(profile.reloadMin, profile.reloadMax);
    }
    return;
  }

  if (!enemyInShootRange(enemy)) {
    profile.burstTimer = random(0.25, 0.55);
    return;
  }

  if (profile.mode === "spread") {
    shootEnemySpread(enemy, profile);
    profile.burstTimer = random(profile.reloadMin, profile.reloadMax);
    return;
  }

  profile.burstRemaining = profile.mode === "single" ? 1 : profile.burstSize;
  profile.burstTimer = 0;
}

function shootPlayerBullet() {
  state.playerBullets.push({
    x: player.x,
    y: player.y - player.h / 2,
    vx: 0,
    vy: -500,
    r: 3,
    damage: 1,
    type: "normal"
  });
}

function shootPlayerBulletWithOffset(offsetX, vx, vy, r, type, damage) {
  state.playerBullets.push({
    x: player.x + offsetX,
    y: player.y - player.h / 2 + 4,
    vx,
    vy,
    r,
    type,
    damage
  });
}

function getBuffStatusText() {
  const active = [];
  if (player.buffs.tripleBurst > 0) {
    active.push(`三连发x${player.buffs.tripleBurst}`);
  }
  if (player.buffs.spread > 0) {
    active.push(`散射x${player.buffs.spread}`);
  }
  if (player.buffs.missile > 0) {
    active.push(`导弹x${player.buffs.missile}`);
  }
  if (player.buffs.nuke > 0) {
    active.push(`核弹库存x${player.buffs.nuke}`);
  }
  return active.length > 0 ? active.join(" | ") : "普通子弹";
}

function addChestBuff(type) {
  if (type === "heal") {
    const before = state.hp;
    state.hp = Math.min(state.maxHp, state.hp + 30);
    const restored = state.hp - before;
    updateHud();
    messageNode.textContent = restored > 0 ? `获得加血宝箱，恢复 ${restored} 点血量！` : "获得加血宝箱，但当前血量已满";
    if (typeof GameAudio !== "undefined") {
      GameAudio.powerup();
    }
    return;
  }

  player.buffs[type] += 1;
  messageNode.textContent = `获得${CHEST_NAMES[type]}宝箱，效果叠加！当前: ${getBuffStatusText()}`;
  if (typeof GameAudio !== "undefined") {
    GameAudio.powerup();
  }
}

function spawnChest() {
  const types = ["tripleBurst", "spread", "missile", "nuke", "heal"];
  const type = types[Math.floor(Math.random() * types.length)];
  spawnChestAt(random(24, width - 24), -20, type);
}

function spawnChestAt(x, y, type) {
  state.chests.push({
    x: Math.max(24, Math.min(width - 24, x)),
    y,
    w: 24,
    h: 24,
    speed: random(90, 130),
    type
  });
}

function onEnemyDestroyed(enemy, scoreValue, options = {}) {
  state.score += scoreValue;
  if (!options.silent && typeof GameAudio !== "undefined") {
    GameAudio.explosion(enemy.type);
  }
  if (enemy.type === "boss" && Math.random() < 0.75) {
    const chestTypes = ["tripleBurst", "spread", "missile", "nuke", "heal"];
    const chestType = chestTypes[Math.floor(Math.random() * chestTypes.length)];
    spawnChestAt(enemy.x, enemy.y, chestType);
    messageNode.textContent = "Boss 被击毁，掉落了宝箱！";
  }
}

function triggerExplosion(x, y, maxRadius, color) {
  state.effects.push({
    x,
    y,
    radius: 8,
    maxRadius,
    life: 0.35,
    color
  });
}

function applyAreaDamage(x, y, radius, damage, scorePerKill) {
  let kills = 0;
  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = state.enemies[i];
    const dx = enemy.x - x;
    const dy = enemy.y - y;
    const hitDistance = radius + Math.max(enemy.w, enemy.h) * 0.45;
    if (dx * dx + dy * dy <= hitDistance * hitDistance) {
      enemy.hp -= damage;
      if (enemy.hp <= 0) {
        state.enemies.splice(i, 1);
        onEnemyDestroyed(enemy, scorePerKill);
        kills += 1;
      }
    }
  }
  if (kills > 0) {
    updateHud();
  }
}

function fireCurrentWeapon() {
  if (typeof GameAudio !== "undefined") {
    GameAudio.shoot();
  }
  shootPlayerBullet();

  if (player.buffs.tripleBurst > 0) {
    player.burstShotsRemaining += 3 * player.buffs.tripleBurst;
    player.burstShotTimer = 0;
  }

  if (player.buffs.spread > 0) {
    shootPlayerBulletWithOffset(0, 0, -520, 3, "normal", 1);
    shootPlayerBulletWithOffset(-6, -150, -500, 3, "normal", 1);
    shootPlayerBulletWithOffset(6, 150, -500, 3, "normal", 1);
    for (let i = 1; i < player.buffs.spread; i += 1) {
      const speedDelta = i * 25;
      shootPlayerBulletWithOffset(-8 - i * 2, -150 - speedDelta, -500, 3, "normal", 1);
      shootPlayerBulletWithOffset(8 + i * 2, 150 + speedDelta, -500, 3, "normal", 1);
    }
  }

  if (player.buffs.missile > 0) {
    if (typeof GameAudio !== "undefined") {
      GameAudio.missileLaunch();
    }
    shootPlayerBulletWithOffset(0, 0, -360, 6, "missile", 999);
    for (let i = 1; i < player.buffs.missile; i += 1) {
      const offset = i * 8;
      shootPlayerBulletWithOffset(-offset, -20 * i, -340, 6, "missile", 999);
      shootPlayerBulletWithOffset(offset, 20 * i, -340, 6, "missile", 999);
    }
  }
}

function castNuke() {
  if (!state.running || player.buffs.nuke <= 0) {
    return;
  }

  player.buffs.nuke -= 1;
  if (state.enemies.length > 0) {
    for (const enemy of state.enemies) {
      onEnemyDestroyed(enemy, 15, { silent: true });
    }
    state.enemies = [];
    state.enemyBullets = [];
    updateHud();
  }
  if (typeof GameAudio !== "undefined") {
    GameAudio.nuke();
  }
  triggerExplosion(width / 2, height / 2, Math.max(width, height), "rgba(255, 246, 143, 0.85)");
  messageNode.textContent = `核弹释放！当前: ${getBuffStatusText()}`;
}


function hitRectCircle(rect, circle) {
  const nearestX = Math.max(rect.x - rect.w / 2, Math.min(circle.x, rect.x + rect.w / 2));
  const nearestY = Math.max(rect.y - rect.h / 2, Math.min(circle.y, rect.y + rect.h / 2));
  const dx = circle.x - nearestX;
  const dy = circle.y - nearestY;
  return dx * dx + dy * dy < circle.r * circle.r;
}

function rectOverlap(a, b) {
  return (
    Math.abs(a.x - b.x) * 2 < a.w + b.w &&
    Math.abs(a.y - b.y) * 2 < a.h + b.h
  );
}

function endGame(text) {
  state.running = false;
  state.cameraShake = 0;
  document.body.classList.remove("playing");
  if (typeof GameAudio !== "undefined") {
    GameAudio.stopAmbience();
    GameAudio.gameOver();
  }
  messageNode.textContent = text || "游戏结束，可按 R 或点击 ReStart 重新开始";
  restartBtn.style.display = "inline-block";
}

function takeDamage(amount) {
  state.hp = Math.max(0, state.hp - amount);
  state.cameraShake = Math.max(state.cameraShake, amount >= 50 ? 10 : 6);
  if (typeof GameAudio !== "undefined") {
    GameAudio.hit(amount);
  }
  updateHud();
  if (state.hp <= 0) {
    endGame("血量归零，游戏结束！按 R 或点击 ReStart 重新开始");
  }
}

function update(dt) {
  if (!state.started || !state.running) {
    return;
  }

  state.elapsed += dt;
  state.level = Math.min(10, 1 + Math.floor(state.elapsed / 18));

  state.cameraShake = Math.max(0, state.cameraShake - dt * 16);

  refreshBuildingColliders();

  const moveX = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
  const moveY = (keys.has("ArrowDown") || keys.has("s") ? 1 : 0) - (keys.has("ArrowUp") || keys.has("w") ? 1 : 0);

  player.x += moveX * player.speed * dt;
  player.y += moveY * player.speed * dt;
  clampPlayerPosition();
  player.velX = (player.x - player.prevX) / Math.max(dt, 0.001);
  player.velY = (player.y - player.prevY) / Math.max(dt, 0.001);
  player.smoothVelX = player.smoothVelX * 0.82 + player.velX * 0.18;
  player.smoothVelY = player.smoothVelY * 0.82 + player.velY * 0.18;
  player.prevX = player.x;
  player.prevY = player.y;
  resolveBuildingCollision(player);
  clampPlayerPosition();

  player.shootTimer -= dt;
  if ((keys.has(" ") || keys.has("Space") || mouse.isDown) && player.shootTimer <= 0) {
    fireCurrentWeapon();
    player.shootTimer = player.shootCooldown;
  }
  if (player.buffs.tripleBurst > 0 && player.burstShotsRemaining > 0) {
    player.burstShotTimer -= dt;
    if (player.burstShotTimer <= 0) {
      shootPlayerBulletWithOffset(0, 0, -540, 3, "normal", 1);
      player.burstShotsRemaining -= 1;
      player.burstShotTimer = 0.06;
    }
  }

  const spawnInterval = Math.max(0.25, 0.95 - state.level * 0.06);
  state.enemySpawnTimer -= dt;
  if (state.enemySpawnTimer <= 0) {
    spawnEnemy();
    state.enemySpawnTimer = spawnInterval;
  }

  state.chestSpawnTimer -= dt;
  if (state.chestSpawnTimer <= 0) {
    spawnChest();
    state.chestSpawnTimer = random(8.5, 13.5);
  }

  for (const bullet of state.playerBullets) {
    bullet.x += (bullet.vx || 0) * dt;
    bullet.y += bullet.vy * dt;
  }
  state.playerBullets = state.playerBullets.filter((b) => {
    if (b.y > -40 && b.x > -50 && b.x < width + 50) {
      for (const building of state.buildingColliders) {
        if (hitRectCircle(building, b)) {
          triggerExplosion(b.x, b.y, 18, "rgba(200, 210, 220, 0.7)");
          return false;
        }
      }
      return true;
    }
    return false;
  });

  for (const bullet of state.enemyBullets) {
    bullet.x += (bullet.vx || 0) * dt;
    bullet.y += bullet.vy * dt;
  }
  state.enemyBullets = state.enemyBullets.filter((b) => {
    if (b.y < height + 20 && b.x > -40 && b.x < width + 40) {
      for (const building of state.buildingColliders) {
        if (hitRectCircle(building, b)) {
          return false;
        }
      }
      return true;
    }
    return false;
  });

  for (const chest of state.chests) {
    chest.y += chest.speed * dt;
  }
  state.chests = state.chests.filter((chest) => chest.y < height + 30);

  for (const enemy of state.enemies) {
    updateEnemyMovement(enemy, dt);
    updateEnemyShooting(enemy, dt);
  }

  // 玩家子弹打中敌机
  for (let i = state.playerBullets.length - 1; i >= 0; i -= 1) {
    const bullet = state.playerBullets[i];
    let hit = false;
    for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
      const enemy = state.enemies[j];
      if (hitRectCircle(enemy, bullet)) {
        hit = true;
        if (bullet.type === "missile") {
          if (typeof GameAudio !== "undefined") {
            GameAudio.explosion("large");
          }
          triggerExplosion(bullet.x, bullet.y, 84, "rgba(255, 179, 71, 0.75)");
          applyAreaDamage(bullet.x, bullet.y, 84, 999, 18);
        } else {
          enemy.hp -= bullet.damage || 1;
          if (enemy.hp <= 0) {
            onEnemyDestroyed(enemy, enemy.type === "boss" ? 80 : enemy.type === "heavy" ? 30 : 10);
            state.enemies.splice(j, 1);
            updateHud();
          }
        }
        break;
      }
    }
    if (hit) {
      state.playerBullets.splice(i, 1);
    }
  }

  // 玩家吃到宝箱切换武器
  for (let i = state.chests.length - 1; i >= 0; i -= 1) {
    const chest = state.chests[i];
    if (rectOverlap(player, chest)) {
      addChestBuff(chest.type);
      triggerExplosion(chest.x, chest.y, 32, "rgba(173, 255, 247, 0.85)");
      state.chests.splice(i, 1);
    }
  }

  // 敌机子弹打中玩家
  for (let i = state.enemyBullets.length - 1; i >= 0; i -= 1) {
    const bullet = state.enemyBullets[i];
    if (hitRectCircle(player, bullet)) {
      state.enemyBullets.splice(i, 1);
      takeDamage(bullet.damage || 20);
      if (!state.running) {
        return;
      }
    }
  }

  // 玩家撞到敌机
  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = state.enemies[i];
    if (rectOverlap(player, enemy)) {
      if (typeof GameAudio !== "undefined") {
        GameAudio.crash();
      }
      endGame("发生撞击，战机坠毁！按 R 或点击 ReStart 重新开始");
      return;
    }
  }

  // 敌机飞出屏幕直接移除（不扣血）
  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    if (state.enemies[i].y - state.enemies[i].h / 2 > height + 8) {
      state.enemies.splice(i, 1);
    }
  }

  for (let i = state.effects.length - 1; i >= 0; i -= 1) {
    const effect = state.effects[i];
    effect.life -= dt;
    effect.radius += (effect.maxRadius - effect.radius) * dt * 8;
    if (effect.life <= 0) {
      state.effects.splice(i, 1);
    }
  }

  updateHud();
}

function renderOverlay() {
  ctx.clearRect(0, 0, width, height);
  if (!state.running && state.started) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "bold 34px sans-serif";
    ctx.fillText("GAME OVER", width / 2, height / 2 - 15);
    ctx.font = "18px sans-serif";
    ctx.fillText(`最终分数: ${state.score}`, width / 2, height / 2 + 20);
  }
}

let lastTime = performance.now();
function gameLoop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  update(dt);

  let focus = null;
  if (typeof Game3D !== "undefined" && Game3D.isReady && Game3D.isReady()) {
    focus = Game3D.sync({ state, player, width, height, dt });
  }
  if (typeof PacificBattleBG !== "undefined" && PacificBattleBG.isReady && PacificBattleBG.isReady()) {
    PacificBattleBG.update(state.elapsed, focus, state.running ? state.cameraShake : 0);
    PacificBattleBG.render();
  }

  renderOverlay();
  requestAnimationFrame(gameLoop);
}

window.addEventListener("keydown", (event) => {
  if (!state.started && event.key.toLowerCase() === "enter") {
    startGame();
    return;
  }
  if (!state.started && event.key.toLowerCase() !== "enter") {
    return;
  }
  if (event.key.toLowerCase() === "r" && !state.running) {
    resetGame();
    return;
  }
  if (event.key.toLowerCase() === "q") {
    castNuke();
    return;
  }

  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Space"].includes(event.key)) {
    event.preventDefault();
  }
  keys.add(event.key);
  keys.add(event.key.toLowerCase());
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key);
  keys.delete(event.key.toLowerCase());
});

canvas.addEventListener("mousedown", (event) => {
  if (!state.started) {
    return;
  }
  if (event.button !== 0) {
    return;
  }
  mouse.isDown = true;
  if (player.shootTimer <= 0 && state.running) {
    fireCurrentWeapon();
    player.shootTimer = player.shootCooldown;
  }
});

canvas.addEventListener("mouseup", (event) => {
  if (event.button === 0) {
    mouse.isDown = false;
  }
});

canvas.addEventListener("mouseleave", () => {
  mouse.isDown = false;
});

restartBtn.addEventListener("click", () => {
  if (!state.running) {
    resetGame();
  }
});

startBtn.addEventListener("click", () => {
  startGame();
});

window.addEventListener("resize", resizeCanvas);

const bg3d = document.getElementById("bg3d");
if (typeof PacificBattleBG !== "undefined" && bg3d) {
  PacificBattleBG.init(bg3d);
  if (typeof Game3D !== "undefined" && PacificBattleBG.getScene) {
    Game3D.init(PacificBattleBG.getScene());
  }
}
resizeCanvas();
resetGame();
requestAnimationFrame(gameLoop);
