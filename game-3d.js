/**
 * 3D 游戏实体渲染（Three.js 程序化战机、子弹、宝箱、爆炸）
 */
(function () {
  let scene = null;
  let gameGroup = null;
  let playerMesh = null;
  let enemyPool = [];
  let bulletPool = [];
  let chestPool = [];
  let effectPool = [];
  let cloudMeshes = [];

  const WORLD = {
    xSpan: 360,
    zFar: -520,
    zNear: 200,
    altitude: 44
  };

  function screenToWorld(sx, sy, w, h) {
    return {
      x: (sx / w - 0.5) * WORLD.xSpan,
      y: WORLD.altitude,
      z: WORLD.zFar + (sy / h) * (WORLD.zNear - WORLD.zFar)
    };
  }

  function jetMat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      metalness: opts.metalness ?? 0.58,
      roughness: opts.roughness ?? 0.36,
      flatShading: true,
      emissive: opts.emissive || 0x000000,
      emissiveIntensity: opts.emissiveIntensity || 0
    });
  }

  function glassMat() {
    return new THREE.MeshStandardMaterial({
      color: 0x8ec8e8,
      metalness: 0.2,
      roughness: 0.08,
      transparent: true,
      opacity: 0.82,
      flatShading: true
    });
  }

  function addPart(group, geo, mat, x, y, z, rx, ry, rz, sx, sy, sz) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    if (ry) m.rotation.y = ry;
    if (rz) m.rotation.z = rz;
    if (sx || sy || sz) m.scale.set(sx || 1, sy || 1, sz || 1);
    group.add(m);
    return m;
  }

  function buildPlayerJet() {
    const g = new THREE.Group();
    const body = jetMat(0x8a96a4);
    const wing = jetMat(0x6e7a88);
    const dark = jetMat(0x3a424c);

    addPart(g, new THREE.ConeGeometry(1.6, 9, 4), body, 0, 0, -4.5, Math.PI / 2, 0, 0, 1, 1, 1.2);
    addPart(g, new THREE.BoxGeometry(2.2, 1.4, 10), body, 0, 0, 1, 0, 0, 0);
    addPart(g, new THREE.BoxGeometry(14, 0.35, 8), wing, 0, 0, 2, 0, 0, 0);
    addPart(g, new THREE.BoxGeometry(4.5, 0.25, 3.5), wing, -5, 0.2, -1.5, 0, 0.35, 0);
    addPart(g, new THREE.BoxGeometry(4.5, 0.25, 3.5), wing, 5, 0.2, -1.5, 0, -0.35, 0);
    addPart(g, new THREE.BoxGeometry(2.8, 0.9, 1.8), dark, -4.2, 0.5, 4.5, 0, 0.45, 0);
    addPart(g, new THREE.BoxGeometry(2.8, 0.9, 1.8), dark, 4.2, 0.5, 4.5, 0, -0.45, 0);
    addPart(g, new THREE.SphereGeometry(1.1, 8, 8), glassMat(), 0, 0.6, -2.5);
    addPart(g, new THREE.CylinderGeometry(0.55, 0.75, 1.6, 8), jetMat(0x2a3038, { metalness: 0.8 }), -0.9, -0.2, 5.8, Math.PI / 2, 0, 0);
    addPart(g, new THREE.CylinderGeometry(0.55, 0.75, 1.6, 8), jetMat(0x2a3038, { metalness: 0.8 }), 0.9, -0.2, 5.8, Math.PI / 2, 0, 0);

    const el = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.85 })
    );
    el.position.set(-0.9, -0.2, 6.6);
    g.add(el);
    const er = el.clone();
    er.position.set(0.9, -0.2, 6.6);
    g.add(er);

    g.userData.exhaust = [el, er];
    g.rotation.x = -0.08;
    return g;
  }

  function buildEnemyJet(type) {
    const g = new THREE.Group();
    const body = jetMat(type === "boss" ? 0x909aa6 : type === "heavy" ? 0x788490 : 0x687480);
    const wing = jetMat(0x5a6672);
    const dark = jetMat(0x343c46);
    const scale = type === "boss" ? 1.35 : type === "heavy" ? 1.08 : 0.82;

    if (type === "boss") {
      addPart(g, new THREE.ConeGeometry(1.8, 8, 4), body, 0, 0, -4, Math.PI / 2, 0, 0, 1.1, 1, 1.3);
      addPart(g, new THREE.BoxGeometry(2.8, 1.5, 11), body, 0, 0, 1.5, 0, 0, 0);
      addPart(g, new THREE.BoxGeometry(16, 0.4, 9), wing, 0, 0, 1, 0, 0, 0);
      addPart(g, new THREE.BoxGeometry(3.2, 1, 2.2), dark, -5.5, 0.4, 5, 0, 0.5, 0);
      addPart(g, new THREE.BoxGeometry(3.2, 1, 2.2), dark, 5.5, 0.4, 5, 0, -0.5, 0);
    } else if (type === "heavy") {
      addPart(g, new THREE.ConeGeometry(1.5, 7.5, 4), body, 0, 0, -3.8, Math.PI / 2, 0, 0);
      addPart(g, new THREE.BoxGeometry(2.4, 1.3, 10), body, 0, 0, 1.2, 0, 0, 0);
      addPart(g, new THREE.BoxGeometry(15, 0.38, 7.5), wing, 0, 0, 1.5, 0, 0, 0);
      addPart(g, new THREE.BoxGeometry(2.6, 0.9, 2), dark, -4.8, 0.45, 4.8, 0, 0.42, 0);
      addPart(g, new THREE.BoxGeometry(2.6, 0.9, 2), dark, 4.8, 0.45, 4.8, 0, -0.42, 0);
      addPart(g, new THREE.BoxGeometry(1.8, 0.8, 3.5), dark, -3.2, 0.3, -0.5, 0, 0.2, 0);
      addPart(g, new THREE.BoxGeometry(1.8, 0.8, 3.5), dark, 3.2, 0.3, -0.5, 0, -0.2, 0);
    } else {
      addPart(g, new THREE.ConeGeometry(1.2, 6.5, 4), body, 0, 0, -3.2, Math.PI / 2, 0, 0);
      addPart(g, new THREE.BoxGeometry(1.8, 1.1, 8), body, 0, 0, 1, 0, 0, 0);
      addPart(g, new THREE.BoxGeometry(10, 0.3, 6), wing, 0, 0, 1.2, 0, 0, 0);
      addPart(g, new THREE.BoxGeometry(1.4, 1.6, 1.2), dark, 0, 0.5, 4.5, 0, 0, 0);
    }

    addPart(g, new THREE.SphereGeometry(type === "boss" ? 1.2 : 0.95, 8, 8), glassMat(), 0, 0.55, -2);
    const ex = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff8833, transparent: true, opacity: 0.75 })
    );
    ex.position.set(type === "normal" ? 0 : -0.8, -0.15, 5.5);
    g.add(ex);
    if (type !== "normal") {
      const ex2 = ex.clone();
      ex2.position.set(0.8, -0.15, 5.5);
      g.add(ex2);
      g.userData.exhaust = [ex, ex2];
    } else {
      g.userData.exhaust = [ex];
    }

    g.scale.setScalar(scale);
    g.rotation.x = 0.08;
    return g;
  }

  function buildBulletMesh(type, damage) {
    if (type === "missile") {
      const g = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x6a7078,
        emissive: 0x331800,
        emissiveIntensity: 0.25,
        metalness: 0.55,
        roughness: 0.35,
        flatShading: true
      });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 3.6, 8), bodyMat);
      body.rotation.x = Math.PI / 2;
      body.position.z = -0.2;
      g.add(body);

      const nose = new THREE.Mesh(
        new THREE.ConeGeometry(0.42, 1.2, 8),
        new THREE.MeshStandardMaterial({ color: 0xd8dce0, metalness: 0.6, roughness: 0.25, flatShading: true })
      );
      nose.rotation.x = -Math.PI / 2;
      nose.position.z = -2.4;
      g.add(nose);

      const finMat = new THREE.MeshStandardMaterial({ color: 0x4a5058, metalness: 0.4, roughness: 0.5, flatShading: true });
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([fx, fy]) => {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.55), finMat);
        fin.position.set(fx * 0.55, fy * 0.55, 0.8);
        g.add(fin);
      });

      const exhaust = new THREE.Mesh(
        new THREE.ConeGeometry(0.35, 1.4, 8),
        new THREE.MeshBasicMaterial({ color: 0xff8833, transparent: true, opacity: 0.75 })
      );
      exhaust.rotation.x = Math.PI / 2;
      exhaust.position.z = 1.6;
      g.add(exhaust);

      const trail = new THREE.Mesh(
        new THREE.ConeGeometry(0.25, 2.2, 8),
        new THREE.MeshBasicMaterial({ color: 0xffaa55, transparent: true, opacity: 0.35 })
      );
      trail.rotation.x = Math.PI / 2;
      trail.position.z = 2.6;
      g.add(trail);
      return g;
    }

    if (type === "enemy") {
      const g = new THREE.Group();
      const isBoss = damage >= 50;
      const shell = new THREE.Mesh(
        new THREE.CylinderGeometry(isBoss ? 0.38 : 0.28, isBoss ? 0.32 : 0.22, isBoss ? 1.8 : 1.3, 6),
        new THREE.MeshStandardMaterial({
          color: isBoss ? 0xff6644 : 0xffaa33,
          emissive: isBoss ? 0xff2200 : 0xff6600,
          emissiveIntensity: 0.55,
          metalness: 0.35,
          roughness: 0.3,
          flatShading: true
        })
      );
      shell.rotation.x = Math.PI / 2;
      shell.position.z = -0.15;
      g.add(shell);

      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(isBoss ? 0.32 : 0.24, 8, 8),
        new THREE.MeshBasicMaterial({ color: isBoss ? 0xffccaa : 0xffee88, transparent: true, opacity: 0.9 })
      );
      tip.position.z = -0.85;
      g.add(tip);

      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(isBoss ? 0.55 : 0.42, 8, 8),
        new THREE.MeshBasicMaterial({
          color: isBoss ? 0xff4422 : 0xffaa44,
          transparent: true,
          opacity: 0.22
        })
      );
      g.add(glow);
      return g;
    }

    const g = new THREE.Group();
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.18, 1.5, 6),
      new THREE.MeshStandardMaterial({
        color: 0x88cce8,
        emissive: 0x22aaff,
        emissiveIntensity: 0.45,
        metalness: 0.4,
        roughness: 0.25,
        flatShading: true
      })
    );
    shell.rotation.x = Math.PI / 2;
    shell.position.z = -0.1;
    g.add(shell);

    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.55, 6),
      new THREE.MeshBasicMaterial({ color: 0xe8ffff, transparent: true, opacity: 0.95 })
    );
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = -0.95;
    g.add(tip);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
    );
    core.position.z = -0.5;
    g.add(core);

    const trail = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 1.2, 6),
      new THREE.MeshBasicMaterial({ color: 0x44ddff, transparent: true, opacity: 0.4 })
    );
    trail.rotation.x = Math.PI / 2;
    trail.position.z = 0.75;
    g.add(trail);
    return g;
  }

  function aimBulletMesh(mesh, b) {
    const vx = b.vx || 0;
    const vy = b.vy || 0;
    if (Math.abs(vx) + Math.abs(vy) < 4) {
      mesh.rotation.set(-0.08, 0, 0);
      return;
    }
    mesh.rotation.order = "YXZ";
    mesh.rotation.y = Math.atan2(vx, vy);
    mesh.rotation.x = -0.06;
    mesh.rotation.z = 0;
  }

  function buildChestMesh(type) {
    const colors = {
      tripleBurst: 0x7ef29f,
      spread: 0x5ee3ff,
      missile: 0xff9f43,
      nuke: 0xff5d8f,
      heal: 0x47d16c
    };
    const g = new THREE.Group();
    const c = colors[type] || 0xffffff;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 2.4, 2.4),
      new THREE.MeshStandardMaterial({
        color: c,
        emissive: c,
        emissiveIntensity: 0.35,
        metalness: 0.3,
        roughness: 0.4
      })
    );
    g.add(box);
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.35, 2.6),
      jetMat(0x1a2034, { metalness: 0.2, roughness: 0.8 })
    );
    g.add(band);
    g.userData.spin = Math.random() * Math.PI * 2;
    return g;
  }

  function buildEffectMesh() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 2, 24),
      new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffeeaa, transparent: true, opacity: 0.6 })
    );
    g.add(core);
    g.userData.ring = ring;
    g.userData.core = core;
    return g;
  }

  function buildCloud() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xe8f0f8,
      transparent: true,
      opacity: 0.55,
      roughness: 1,
      metalness: 0,
      flatShading: true
    });
    for (let i = 0; i < 4; i += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(8 + Math.random() * 6, 6, 6), mat);
      puff.position.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 8);
      g.add(puff);
    }
    return g;
  }

  function init(targetScene) {
    if (!targetScene || typeof THREE === "undefined") {
      return false;
    }
    scene = targetScene;
    gameGroup = new THREE.Group();
    scene.add(gameGroup);

    playerMesh = buildPlayerJet();
    gameGroup.add(playerMesh);

    for (let i = 0; i < 12; i += 1) {
      const c = buildCloud();
      c.position.set((Math.random() - 0.5) * 500, 80 + Math.random() * 60, -200 - Math.random() * 400);
      gameGroup.add(c);
      cloudMeshes.push({ mesh: c, speed: 12 + Math.random() * 20 });
    }

    return true;
  }

  function ensurePool(pool, count, factory) {
    while (pool.length < count) {
      const mesh = factory();
      mesh.visible = false;
      gameGroup.add(mesh);
      pool.push(mesh);
    }
  }

  function syncPlayer(player, w, h) {
    if (!playerMesh) {
      return null;
    }
    const pos = screenToWorld(player.x, player.y, w, h);
    playerMesh.position.set(pos.x, pos.y, pos.z);

    const smoothVelX = player.smoothVelX || 0;
    const smoothVelY = player.smoothVelY || 0;
    const bank = Math.max(-0.28, Math.min(0.28, smoothVelX * 0.0012));
    const pitch = Math.max(-0.22, Math.min(0.22, -smoothVelY * 0.0012));
    playerMesh.rotation.set(-0.08 + pitch, 0, -bank);

    const power = 0.7 + Math.min(0.5, Math.hypot(smoothVelX, smoothVelY) * 0.0005);
    (playerMesh.userData.exhaust || []).forEach((ex) => {
      ex.scale.setScalar(0.8 + power * 0.5);
      ex.material.opacity = 0.55 + power * 0.35;
    });

    return pos;
  }

  function disposeObject(obj) {
    obj.traverse((c) => {
      if (c.geometry) {
        c.geometry.dispose();
      }
      if (c.material) {
        if (Array.isArray(c.material)) {
          c.material.forEach((m) => m.dispose());
        } else {
          c.material.dispose();
        }
      }
    });
  }

  function syncEnemies(enemies, w, h) {
    ensurePool(enemyPool, enemies.length, () => {
      const m = buildEnemyJet("normal");
      m.userData.type = "normal";
      return m;
    });
    for (let i = 0; i < enemyPool.length; i += 1) {
      if (i >= enemies.length) {
        enemyPool[i].visible = false;
        continue;
      }
      const e = enemies[i];
      if (enemyPool[i].userData.type !== e.type) {
        gameGroup.remove(enemyPool[i]);
        disposeObject(enemyPool[i]);
        const replacement = buildEnemyJet(e.type);
        replacement.userData.type = e.type;
        enemyPool[i] = replacement;
        gameGroup.add(replacement);
      }
      const m = enemyPool[i];
      m.visible = true;
      const pos = screenToWorld(e.x, e.y, w, h);
      m.position.set(pos.x, pos.y, pos.z);
      m.rotation.y = Math.PI;
      m.rotation.z = typeof e.tilt === "number" ? e.tilt : Math.sin(stateElapsed * 2 + i) * 0.06;
    }
  }

  let stateElapsed = 0;

  function syncBullets(playerBullets, enemyBullets, w, h) {
    const total = playerBullets.length + enemyBullets.length;
    ensurePool(bulletPool, total, () => {
      const m = buildBulletMesh("normal", 1);
      m.userData.kind = "normal";
      return m;
    });

    let idx = 0;
    playerBullets.forEach((b) => {
      if (bulletPool[idx].userData.kind !== b.type) {
        gameGroup.remove(bulletPool[idx]);
        disposeObject(bulletPool[idx]);
        const nb = buildBulletMesh(b.type, 1);
        nb.userData.kind = b.type;
        bulletPool[idx] = nb;
        gameGroup.add(nb);
      }
      const m = bulletPool[idx];
      m.visible = true;
      const pos = screenToWorld(b.x, b.y, w, h);
      m.position.set(pos.x, pos.y, pos.z);
      aimBulletMesh(m, b);
      idx += 1;
    });

    enemyBullets.forEach((b) => {
      const kind = `enemy-${b.damage}`;
      if (bulletPool[idx].userData.kind !== kind) {
        gameGroup.remove(bulletPool[idx]);
        disposeObject(bulletPool[idx]);
        const nb = buildBulletMesh("enemy", b.damage);
        nb.userData.kind = kind;
        bulletPool[idx] = nb;
        gameGroup.add(nb);
      }
      const m = bulletPool[idx];
      m.visible = true;
      const pos = screenToWorld(b.x, b.y, w, h);
      m.position.set(pos.x, pos.y, pos.z);
      aimBulletMesh(m, b);
      idx += 1;
    });

    for (let i = idx; i < bulletPool.length; i += 1) {
      bulletPool[i].visible = false;
    }
  }

  function syncChests(chests, w, h, dt) {
    ensurePool(chestPool, chests.length, () => buildChestMesh("heal"));
    for (let i = 0; i < chestPool.length; i += 1) {
      const mesh = chestPool[i];
      if (i >= chests.length) {
        mesh.visible = false;
        continue;
      }
      const c = chests[i];
      if (mesh.userData.chestType !== c.type) {
        gameGroup.remove(mesh);
        disposeObject(mesh);
        const nb = buildChestMesh(c.type);
        nb.userData.chestType = c.type;
        chestPool[i] = nb;
        gameGroup.add(nb);
      }
      const m = chestPool[i];
      m.visible = true;
      m.userData.chestType = c.type;
      const pos = screenToWorld(c.x, c.y, w, h);
      m.position.set(pos.x, pos.y + 1.5, pos.z);
      m.userData.spin = (m.userData.spin || 0) + dt * 1.8;
      m.rotation.y = m.userData.spin;
    }
  }

  function syncEffects(effects, w, h) {
    ensurePool(effectPool, effects.length, buildEffectMesh);
    for (let i = 0; i < effectPool.length; i += 1) {
      const mesh = effectPool[i];
      if (i >= effects.length) {
        mesh.visible = false;
        continue;
      }
      const e = effects[i];
      mesh.visible = true;
      const pos = screenToWorld(e.x, e.y, w, h);
      mesh.position.set(pos.x, pos.y, pos.z);
      const t = 1 - e.life / 0.35;
      const scale = e.radius * 0.08;
      mesh.scale.setScalar(scale);
      if (mesh.userData.ring) {
        mesh.userData.ring.material.opacity = 0.85 * (1 - t);
      }
      if (mesh.userData.core) {
        mesh.userData.core.material.opacity = 0.6 * (1 - t);
      }
    }
  }

  function updateClouds(dt) {
    cloudMeshes.forEach((c) => {
      c.mesh.position.z += c.speed * dt;
      if (c.mesh.position.z > 260) {
        c.mesh.position.z = -620;
        c.mesh.position.x = (Math.random() - 0.5) * 500;
      }
    });
  }

  function sync(payload) {
    if (!gameGroup) {
      return null;
    }
    const { state, player, width, height, dt } = payload;
    stateElapsed = state.elapsed;

    updateClouds(dt || 0.016);

    const focus = syncPlayer(player, width, height);
    syncEnemies(state.enemies, width, height);
    syncBullets(state.playerBullets, state.enemyBullets, width, height);
    syncChests(state.chests, width, height, dt || 0.016);
    syncEffects(state.effects, width, height);

    return focus;
  }

  function clear() {
    if (!gameGroup) {
      return;
    }
    [enemyPool, bulletPool, chestPool, effectPool].forEach((pool) => {
      pool.forEach((m) => {
        m.visible = false;
      });
    });
  }

  window.Game3D = {
    init,
    sync,
    clear,
    screenToWorld,
    isReady() {
      return !!gameGroup;
    }
  };
})();
