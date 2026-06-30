/**
 * 城市 + 森林 3D 空战背景（Three.js）
 */
(function () {
  let renderer;
  let scene;
  let camera;
  let terrain;
  let terrainGeom;
  let cityGroup;
  let forestGroup;
  let scrollGroup;
  let skyTex;
  let sunLight;
  let scrollOffset = 0;

  const WORLD_MAP = {
    xSpan: 360,
    zFar: -520,
    zNear: 200,
    scrollLoop: 720
  };

  const BUILDING_BLOCKS = [
    { x: -280, z: -420, w: 38, d: 32, h: 85 },
    { x: -220, z: -480, w: 52, d: 40, h: 120 },
    { x: -150, z: -390, w: 44, d: 36, h: 95 },
    { x: -80, z: -520, w: 60, d: 45, h: 140 },
    { x: -10, z: -440, w: 48, d: 38, h: 105 },
    { x: 70, z: -500, w: 55, d: 42, h: 128 },
    { x: 150, z: -410, w: 42, d: 34, h: 88 },
    { x: 220, z: -470, w: 58, d: 44, h: 115 },
    { x: 290, z: -540, w: 46, d: 36, h: 98 },
    { x: -320, z: -580, w: 36, d: 30, h: 72 },
    { x: 120, z: -600, w: 64, d: 48, h: 155 },
    { x: -180, z: -650, w: 50, d: 40, h: 110 },
    { x: 40, z: -680, w: 72, d: 50, h: 165 },
    { x: 260, z: -620, w: 40, d: 32, h: 82 }
  ];

  function worldToScreenRect(wx, wz, bw, bd, bh, screenW, screenH) {
    const zRange = WORLD_MAP.zNear - WORLD_MAP.zFar;
    const sx = (wx / WORLD_MAP.xSpan + 0.5) * screenW;
    const sy = ((wz - WORLD_MAP.zFar) / zRange) * screenH;
    const sw = (bw / WORLD_MAP.xSpan) * screenW * 1.08;
    const sh = (bd / zRange) * screenH * 1.15 + Math.min(bh * 0.08, 28);
    return { x: sx, y: sy, w: sw, h: sh };
  }

  function getBuildingColliders(screenW, screenH, elapsed) {
    const scroll = elapsed !== undefined ? (elapsed * 38) % WORLD_MAP.scrollLoop : scrollOffset;
    const colliders = [];
    BUILDING_BLOCKS.forEach((b, id) => {
      for (let wrap = -1; wrap <= 1; wrap += 1) {
        const wz = b.z + scroll + wrap * WORLD_MAP.scrollLoop;
        const rect = worldToScreenRect(b.x, wz, b.w, b.d, b.h, screenW, screenH);
        if (rect.y < -rect.h || rect.y > screenH + rect.h) {
          continue;
        }
        colliders.push({
          id: `${id}-${wrap}`,
          x: rect.x,
          y: rect.y,
          w: rect.w,
          h: rect.h
        });
      }
    });
    return colliders;
  }

  function makeSkyGradientTexture() {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    const cx = c.getContext("2d");
    const g = cx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, "#3a5570");
    g.addColorStop(0.25, "#6a8aa8");
    g.addColorStop(0.55, "#a8c4d8");
    g.addColorStop(0.78, "#e8dcc8");
    g.addColorStop(1, "#f5ead6");
    cx.fillStyle = g;
    cx.fillRect(0, 0, 512, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    if (THREE.SRGBColorSpace) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    return tex;
  }

  function addBuilding(group, x, z, w, d, h, color, windowGlow) {
    const bodyMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.72,
      metalness: 0.18,
      flatShading: true
    });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
    b.position.set(x, h * 0.5 - 1.2, z);
    group.add(b);

    if (windowGlow && h > 18) {
      const rows = Math.floor(h / 8);
      const winMat = new THREE.MeshBasicMaterial({
        color: 0xffe8a8,
        transparent: true,
        opacity: 0.35 + Math.random() * 0.35
      });
      for (let r = 0; r < rows; r += 1) {
        if (Math.random() > 0.55) {
          continue;
        }
        const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.55, 1.8), winMat);
        win.position.set(x, 4 + r * 7, z + d * 0.51);
        group.add(win);
      }
    }
  }

  function addCity() {
    cityGroup = new THREE.Group();
    const palette = [0x4a5564, 0x5c6878, 0x3e4854, 0x6a7585, 0x525d6a];
    BUILDING_BLOCKS.forEach((b) => {
      addBuilding(
        cityGroup,
        b.x,
        b.z,
        b.w,
        b.d,
        b.h,
        palette[Math.floor(Math.random() * palette.length)],
        true
      );
    });

    const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a2e32, roughness: 0.95, metalness: 0.05 });
    const road1 = new THREE.Mesh(new THREE.PlaneGeometry(900, 28), roadMat);
    road1.rotation.x = -Math.PI / 2;
    road1.position.set(0, -0.8, -480);
    cityGroup.add(road1);
    const road2 = new THREE.Mesh(new THREE.PlaneGeometry(22, 700), roadMat);
    road2.rotation.x = -Math.PI / 2;
    road2.position.set(-40, -0.75, -500);
    cityGroup.add(road2);

    scrollGroup.add(cityGroup);
  }

  function addTree(group, x, z, scale) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2 * scale, 1.6 * scale, 5 * scale, 5),
      new THREE.MeshStandardMaterial({ color: 0x4a3528, roughness: 0.95, flatShading: true })
    );
    trunk.position.set(x, 2.2 * scale, z);
    group.add(trunk);

    const foliageMat = new THREE.MeshStandardMaterial({
      color: Math.random() > 0.5 ? 0x2d6b3a : 0x3a7a48,
      roughness: 0.92,
      flatShading: true
    });
    const crown = new THREE.Mesh(new THREE.ConeGeometry(4.5 * scale, 10 * scale, 6), foliageMat);
    crown.position.set(x, 8 * scale, z);
    group.add(crown);
    const crown2 = new THREE.Mesh(new THREE.ConeGeometry(3.5 * scale, 8 * scale, 6), foliageMat);
    crown2.position.set(x, 11 * scale, z);
    group.add(crown2);
  }

  function addForest() {
    forestGroup = new THREE.Group();
    for (let i = 0; i < 120; i += 1) {
      const x = (Math.random() - 0.5) * 780;
      const z = -120 - Math.random() * 620;
      const scale = 0.7 + Math.random() * 1.4;
      if (Math.abs(x) < 90 && z > -520 && z < -380) {
        continue;
      }
      addTree(forestGroup, x, z, scale);
    }

    const hillMat = new THREE.MeshStandardMaterial({ color: 0x2f5c38, roughness: 1, flatShading: true });
    const hills = [
      { x: -520, z: -200, s: 120, h: 28 },
      { x: 540, z: -280, s: 140, h: 32 },
      { x: 180, z: -120, s: 90, h: 20 },
      { x: -300, z: -340, s: 110, h: 24 }
    ];
    hills.forEach((h) => {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(h.s, h.h, 8), hillMat);
      hill.position.set(h.x, h.h * 0.5 - 2, h.z);
      forestGroup.add(hill);
    });

    scrollGroup.add(forestGroup);
  }

  function init(container) {
    if (typeof THREE === "undefined" || !container) {
      return false;
    }

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xc8d4c4, 0.00032);

    skyTex = makeSkyGradientTexture();
    scene.background = skyTex;

    camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 1, 12000);
    camera.position.set(0, 148, 360);
    camera.lookAt(0, 4, -240);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0xa8c4d8, 1);
    if (THREE.ACESFilmicToneMapping !== undefined) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
    }
    if (THREE.SRGBColorSpace !== undefined) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    container.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xd8e8f0, 0x3a5a38, 0.82);
    scene.add(hemi);

    sunLight = new THREE.DirectionalLight(0xfff0d8, 1.25);
    sunLight.position.set(420, 520, 220);
    scene.add(sunLight);

    const fill = new THREE.DirectionalLight(0x88a8c8, 0.32);
    fill.position.set(-280, 140, -80);
    scene.add(fill);

    terrainGeom = new THREE.PlaneGeometry(6400, 6400, 96, 96);
    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0x3a6b42,
      roughness: 0.96,
      metalness: 0,
      flatShading: true
    });
    terrain = new THREE.Mesh(terrainGeom, terrainMat);
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.y = -2;
    scene.add(terrain);

    scrollGroup = new THREE.Group();
    scene.add(scrollGroup);
    addCity();
    addForest();

    return true;
  }

  function updateTerrain(t) {
    if (!terrainGeom) {
      return;
    }
    const pos = terrainGeom.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const h1 = Math.sin(x * 0.004 + t * 0.4) * 1.8;
      const h2 = Math.sin(y * 0.0035 + t * 0.32) * 1.4;
      const h3 = Math.sin((x + y) * 0.002) * 0.9;
      pos.setZ(i, h1 + h2 + h3);
    }
    pos.needsUpdate = true;
    terrainGeom.computeVertexNormals();
  }

  function update(elapsed, focus, shake) {
    if (!camera) {
      return;
    }
    updateTerrain(elapsed);
    const fx = focus ? focus.x : 0;
    const fz = focus ? focus.z : 120;
    const shakeAmt = shake || 0;
    const sway = Math.sin(elapsed * 0.1) * 5 + (Math.random() - 0.5) * shakeAmt;
    const bob = Math.sin(elapsed * 0.15) * 1.8 + (Math.random() - 0.5) * shakeAmt * 0.4;
    camera.position.set(fx * 0.35 + sway, 132 + bob, fz + 185);
    camera.lookAt(fx * 0.35, 38, fz - 95);

    if (scrollGroup) {
      scrollOffset = (elapsed * 38) % WORLD_MAP.scrollLoop;
      scrollGroup.position.z = scrollOffset;
    }
  }

  function renderScene() {
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  function setSize(w, h) {
    if (!camera || !renderer) {
      return;
    }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  window.PacificBattleBG = {
    init,
    update,
    render: renderScene,
    setSize,
    getScene() {
      return scene;
    },
    getCamera() {
      return camera;
    },
    getBuildingColliders,
    getScrollOffset() {
      return scrollOffset;
    },
    isReady() {
      return !!renderer;
    }
  };
})();
