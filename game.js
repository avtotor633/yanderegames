// ============ Yandere School 3D ============
// Полная реализация прототипа

let scene, camera, renderer, clock;
let quality = 'mid';
let cameraSensitivity = 1.5;
let masterVolume = 0.6;

const loader = { total:0, done:0 };
function setLoad(p, text) {
  document.getElementById('bar-fill').style.width = p + '%';
  if (text) document.getElementById('load-text').textContent = text;
}

// ---------- Мир ----------
const world = {
  walls: [],       // коллайдеры {minX,maxX,minZ,maxZ}
  npcs: [],
  rivals: [],
  police: [],
  items: []
};

let player, senpai;
let gameTime = 8 * 60; // минуты с 00:00
let suspicion = 0;
let reputation = 50;
let alarmActive = false;
let alarmTimer = 0;
let alarmTriggered = false;

// ---------- Инициализация ----------
window.addEventListener('load', init);

function init() {
  try {
    setLoad(5, 'Инициализация...');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87b6d9);
    scene.fog = new THREE.Fog(0x87b6d9, 40, 120);

    camera = new THREE.PerspectiveCamera(65, window.innerWidth/window.innerHeight, 0.1, 300);
    camera.position.set(0, 4, 8);

    renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', powerPreference:'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'low' ? 1 : 1.5));
    renderer.shadowMap.enabled = quality !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    setLoad(15, 'Создание кампуса...');
    buildWorld();

    setLoad(50, 'Создание персонажей...');
    createPlayer();
    createSenpai();
    createRivals();
    createNPCs();

    setLoad(85, 'Настройка интерфейса...');
    setupControls();
    setupMinimap();

    setLoad(100, 'Готово!');
    setTimeout(() => {
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('game-ui').classList.remove('hidden');
      resize();
      animate();
    }, 400);

    window.addEventListener('resize', resize);
  } catch (e) {
    console.error(e);
    document.getElementById('load-text').textContent = 'Ошибка: ' + e.message;
  }
}

function resize() {
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------- Построение мира ----------
function buildWorld() {
  // Земля
  const groundGeo = new THREE.PlaneGeometry(200, 200);
  const groundMat = new THREE.MeshLambertMaterial({ color:0x88aa66 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI/2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Асфальт (двор)
  addBox(0, 0.02, 0, 50, 0.05, 40, 0x555555, false);

  // Главное здание
  addBox(-30, 4, -30, 25, 8, 18, 0xddccbb, true); // корпус
  addBox(-30, 8.5, -30, 26, 1, 19, 0x884455, true); // крыша
  // Двери
  addBox(-30, 1.5, -21, 3, 3, 0.3, 0x553322, true);
  // Окна
  for (let i=0;i<4;i++) addBox(-40+i*7, 4, -21, 3, 2, 0.2, 0x88bbdd, false, true);
  // Второе здание (кафетерий/спортзал)
  addBox(35, 3, -25, 18, 6, 14, 0xccbbaa, true);
  addBox(35, 6.5, -25, 19, 1, 15, 0x554433, true);
  addBox(35, 1.5, -18, 3, 3, 0.3, 0x553322, true);

  // Коллайдеры для зданий
  world.walls.push({minX:-43, maxX:-17, minZ:-40, maxZ:-20});
  world.walls.push({minX:26, maxX:44, minZ:-33, maxZ:-17});

  // Забор по периметру
  const fenceMat = new THREE.MeshLambertMaterial({ color:0x8b6f47 });
  for (let i=-50;i<=50;i+=4) {
    addBox(i, 1.5, -50, 0.5, 3, 0.5, 0x8b6f47, true);
    addBox(i, 1.5,  50, 0.5, 3, 0.5, 0x8b6f47, true);
    addBox(-50, 1.5, i, 0.5, 3, 0.5, 0x8b6f47, true);
    addBox( 50, 1.5, i, 0.5, 3, 0.5, 0x8b6f47, true);
  }
  // Границы мира (невидимые коллайдеры)
  world.walls.push({minX:-51, maxX:-49, minZ:-51, maxZ:51});
  world.walls.push({minX:49, maxX:51, minZ:-51, maxZ:51});
  world.walls.push({minX:-51, maxX:51, minZ:-51, maxZ:-49});
  world.walls.push({minX:-51, maxX:51, minZ:49, maxZ:51});

  // Фонтан
  const fountainBase = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4, 0.8, 24),
    new THREE.MeshLambertMaterial({ color:0x9999aa })
  );
  fountainBase.position.set(0, 0.4, 0);
  fountainBase.receiveShadow = true;
  fountainBase.castShadow = true;
  scene.add(fountainBase);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(3.5, 3.5, 0.2, 24),
    new THREE.MeshLambertMaterial({ color:0x4499dd, transparent:true, opacity:0.8 })
  );
  water.position.set(0, 0.85, 0);
  scene.add(water);
  world.walls.push({minX:-4, maxX:4, minZ:-4, maxZ:4});

  // Деревья
  const treePositions = [[-15,8],[-20,15],[-8,-8],[15,10],[20,-8],[-25,5],[10,20],[-10,25]];
  treePositions.forEach(([x,z]) => {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4,0.5,3,8),
      new THREE.MeshLambertMaterial({ color:0x6b4423 })
    );
    trunk.position.set(x, 1.5, z);
    trunk.castShadow = true;
    scene.add(trunk);
    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 8, 8),
      new THREE.MeshLambertMaterial({ color:0x3a8833 })
    );
    leaves.position.set(x, 4, z);
    leaves.castShadow = true;
    scene.add(leaves);
    world.walls.push({minX:x-0.5, maxX:x+0.5, minZ:z-0.5, maxZ:z+0.5});
  });

  // Скамейки
  [[-6,10],[6,10],[-10,-4]].forEach(([x,z]) => {
    addBox(x, 0.6, z, 2, 0.2, 0.6, 0x884422, true);
    addBox(x, 0.3, z, 0.3, 0.6, 0.6, 0x663311, true);
  });

  // Шкафчики (внутри здания - упрощённо)
  for (let i=0;i<8;i++) {
    addBox(-38+i*1.5, 1.5, -20.5, 1.3, 2.6, 0.4, 0x4477aa, true);
  }

  // Парты (во дворе под навесом для простоты)
  for (let i=0;i<4;i++) {
    addBox(20+i*3, 0.4, 15, 2, 0.15, 1, 0xaa8866, true);
    addBox(20+i*3, 0.2, 15, 0.2, 0.4, 1, 0x664422, true);
  }

  // Освещение
  const hemi = new THREE.HemisphereLight(0xffffff, 0x667744, 0.7);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffeedd, 1.0);
  sun.position.set(30, 60, 20);
  sun.castShadow = quality !== 'low';
  sun.shadow.mapSize.width = quality === 'high' ? 2048 : 1024;
  sun.shadow.mapSize.height = quality === 'high' ? 2048 : 1024;
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.far = 150;
  scene.add(sun);

  // Трава/цветы (декоративные пятна)
  for (let i=0;i<40;i++) {
    const g = new THREE.Mesh(
      new THREE.CircleGeometry(0.3, 5),
      new THREE.MeshLambertMaterial({ color:[0xff69b4,0xffdd44,0xffffff][i%3] })
    );
    g.rotation.x = -Math.PI/2;
    g.position.set((Math.random()-0.5)*80, 0.03, (Math.random()-0.5)*80);
    scene.add(g);
  }
}

function addBox(x, y, z, w, h, d, color, collider=false, glass=false) {
  const mat = glass
    ? new THREE.MeshLambertMaterial({ color, transparent:true, opacity:0.5 })
    : new THREE.MeshLambertMaterial({ color });
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  box.position.set(x, y, z);
  box.castShadow = true;
  box.receiveShadow = true;
  scene.add(box);
  if (collider) world.walls.push({minX:x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2});
  return box;
}

// ---------- Персонажи ----------
function buildHumanoid(opts) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: opts.skin || 0xffe0c0 });
  const shirt = new THREE.MeshLambertMaterial({ color: opts.shirt || 0x3355aa });
  const skirt = new THREE.MeshLambertMaterial({ color: opts.skirt || 0x223366 });
  const hairMat = new THREE.MeshLambertMaterial({ color: opts.hair || 0x552233 });

  // Торс
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 1.0, 8), shirt);
  torso.position.y = 1.35;
  torso.castShadow = true;
  group.add(torso);

  // Юбка
  const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.5, 8), skirt);
  sk.position.y = 0.75;
  sk.castShadow = true;
  group.add(sk);

  // Голова
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12), skin);
  head.position.y = 2.1;
  head.castShadow = true;
  group.add(head);

  // Волосы
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12, 0, Math.PI*2, 0, Math.PI*0.65), hairMat);
  hair.position.y = 2.2;
  group.add(hair);
  // Хвостики/длина
  if (opts.hairStyle !== 2) {
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.8, 6), hairMat);
    tail.position.set(0, 1.7, -0.35);
    group.add(tail);
  }

  // Глаза
  const eyeMat = new THREE.MeshBasicMaterial({ color: opts.eye || 0x220011 });
  const eyeGeo = new THREE.SphereGeometry(0.07, 8, 8);
  const eL = new THREE.Mesh(eyeGeo, eyeMat); eL.position.set(-0.13, 2.12, 0.32); group.add(eL);
  const eR = new THREE.Mesh(eyeGeo, eyeMat); eR.position.set( 0.13, 2.12, 0.32); group.add(eR);

  // Руки
  const armGeo = new THREE.CylinderGeometry(0.09, 0.09, 1.0, 6);
  const armL = new THREE.Mesh(armGeo, skin);
  armL.position.set(-0.45, 1.4, 0);
  armL.castShadow = true;
  group.add(armL);
  const armR = new THREE.Mesh(armGeo, skin);
  armR.position.set(0.45, 1.4, 0);
  armR.castShadow = true;
  group.add(armR);

  // Ноги
  const legGeo = new THREE.CylinderGeometry(0.12, 0.11, 1.0, 6);
  const legMat = new THREE.MeshLambertMaterial({ color: opts.skin || 0xffe0c0 });
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.18, 0.4, 0);
  legL.castShadow = true;
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.18, 0.4, 0);
  legR.castShadow = true;
  group.add(legR);

  group.userData.parts = { armL, armR, legL, legR, head, torso };
  return group;
}

function createPlayer() {
  player = buildHumanoid({ hair: 0xff69b4, shirt: 0xff69b4, skirt: 0x880044, eye: 0xff1493 });
  player.position.set(0, 0, 10);
  scene.add(player);
  player.userData = {
    ...player.userData,
    velocity: new THREE.Vector3(),
    speed: 4,
    runSpeed: 8,
    crouchSpeed: 2,
    running: false,
    crouching: false,
    animTime: 0,
    reputation: 50,
    laughCooldown: 0
  };
}

function createSenpai() {
  senpai = buildHumanoid({ hair: 0x2a1a0a, shirt: 0x334466, skirt: 0x2a2a3a, skin:0xffe0c0, eye:0x112233 });
  senpai.position.set(0, 0, -5);
  scene.add(senpai);
  senpai.userData = {
    ...senpai.userData,
    velocity: new THREE.Vector3(),
    speed: 2.5,
    target: new THREE.Vector3(0,0,-5),
    state: 'idle',
    schedule: [
      {time: 8*60, pos: new THREE.Vector3(-30,0,-15), label:'Утро у входа'},
      {time: 9*60, pos: new THREE.Vector3(0,0,-5), label:'Идёт на урок'},
      {time: 10*60, pos: new THREE.Vector3(35,0,-20), label:'В кафетерии'},
      {time: 12*60, pos: new THREE.Vector3(0,0,0), label:'У фонтана'},
      {time: 14*60, pos: new THREE.Vector3(-25,0,10), label:'В библиотеке'},
      {time: 16*60, pos: new THREE.Vector3(0,0,15), label:'На дворе'},
    ],
    relationship: 0,
    animTime: 0,
    talkCooldown: 0,
    type: 'senpai'
  };
  world.npcs.push(senpai);
}

const RIVAL_DATA = [
  {name:'Аико', hair:0xffcc33, shirt:0xffee44, skirt:0x885500, eye:0x443300, personality:'cheerful'},
  {name:'Бэни', hair:0xdd3344, shirt:0xcc3344, skirt:0x551122, eye:0x330000, personality:'tsundere'},
  {name:'Хана', hair:0x8844aa, shirt:0xaa66cc, skirt:0x442266, eye:0x220033, personality:'shy'},
  {name:'Кайо', hair:0x4499dd, shirt:0x3366cc, skirt:0x113366, eye:0x001133, personality:'cold'},
  {name:'Мики', hair:0x44dd88, shirt:0x55cc88, skirt:0x226644, eye:0x002211, personality:'energetic'}
];
const RIVAL_NAMES = ['Аико','Бэни','Хана','Кайо','Мики'];

function createRivals() {
  const spawns = [[-20,0,-10],[15,0,-12],[-8,0,15],[25,0,5],[-35,0,-15]];
  RIVAL_DATA.forEach((data, i) => {
    const r = buildHumanoid({ hair: data.hair, shirt: data.shirt, skirt: data.skirt, eye: data.eye });
    r.position.copy(new THREE.Vector3(spawns[i][0], 0, spawns[i][2]));
    scene.add(r);
    r.userData = {
      ...r.userData,
      name: data.name,
      personality: data.personality,
      velocity: new THREE.Vector3(),
      speed: 2,
      target: new THREE.Vector3(spawns[i][0] + (Math.random()-0.5)*10, 0, spawns[i][2] + (Math.random()-0.5)*10),
      state: 'idle',
      animTime: 0,
      suspicionOfPlayer: 0,
      relationshipWithSenpai: 30 + Math.random()*30,
      eliminated: false,
      scheduled: generateRivalSchedule(i),
      nextScheduleIdx: 0,
      talkCooldown: 0,
      type: 'rival'
    };
    world.rivals.push(r);
    world.npcs.push(r);
  });
}

function generateRivalSchedule(i) {
  const zones = [[-30,-15],[-20,-10],[-10,-5],[0,0],[10,5],[20,10],[30,-15],[-35,5]];
  const sched = [];
  for (let t=8;t<=17;t+=1) {
    const z = zones[(i + t) % zones.length];
    sched.push({ time: t*60, pos: new THREE.Vector3(z[0] + (Math.random()-0.5)*6, 0, z[1] + (Math.random()-0.5)*6) });
  }
  return sched;
}

function createNPCs() {
  const baseColors = [0x8866cc, 0x44aabb, 0xcc8844, 0xaa4488, 0x668833];
  const spawns = [[-15,0,5],[5,0,20],[20,0,-5],[-25,0,10],[10,0,-10],[-5,0,-18],[30,0,5],[-30,0,-15]];
  for (let i=0;i<8;i++) {
    const c = baseColors[i % baseColors.length];
    const n = buildHumanoid({ hair: 0x333333, shirt: c, skirt: 0x222222 });
    n.position.set(spawns[i][0], 0, spawns[i][2]);
    scene.add(n);
    n.userData = {
      ...n.userData,
      name: 'Ученик ' + (i+1),
      velocity: new THREE.Vector3(),
      speed: 2 + Math.random(),
      target: new THREE.Vector3((Math.random()-0.5)*40, 0, (Math.random()-0.5)*40),
      state: 'idle',
      animTime: 0,
      suspicionOfPlayer: 0,
      talkCooldown: 0,
      type: 'npc'
    };
    world.npcs.push(n);
  }
}

// ---------- Управление ----------
let joystick = { active:false, x:0, y:0, id:null, baseX:0, baseY:0 };
let look = { active:false, id:null, lastX:0, lastY:0 };
let cameraAngle = 0;
let cameraHeight = 3.5;
let cameraDist = 7;
let cameraPitch = 0.3;

function setupControls() {
  const jEl = document.getElementById('joystick');
  const stick = document.getElementById('stick');

  jEl.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    joystick.active = true;
    joystick.id = t.identifier;
    const r = jEl.getBoundingClientRect();
    joystick.baseX = r.left + r.width/2;
    joystick.baseY = r.top + r.height/2;
    updateJoystick(t.clientX, t.clientY, stick);
  }, {passive:false});
  jEl.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joystick.id) updateJoystick(t.clientX, t.clientY, stick);
    }
  }, {passive:false});
  const endJ = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === joystick.id) {
        joystick.active = false;
        joystick.id = null;
        joystick.x = 0; joystick.y = 0;
        stick.style.transform = 'translate(-50%,-50%)';
      }
    }
  };
  jEl.addEventListener('touchend', endJ);
  jEl.addEventListener('touchcancel', endJ);

  function updateJoystick(x, y, stickEl) {
    const dx = x - joystick.baseX;
    const dy = y - joystick.baseY;
    const max = 45;
    const len = Math.min(Math.sqrt(dx*dx+dy*dy), max);
    const ang = Math.atan2(dy, dx);
    const sx = Math.cos(ang)*len;
    const sy = Math.sin(ang)*len;
    stickEl.style.transform = `translate(calc(-50% + ${sx}px), calc(-50% + ${sy}px))`;
    joystick.x = sx/max;
    joystick.y = sy/max;
  }

  // Look area
  const lookArea = document.getElementById('look-area');
  lookArea.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    look.active = true;
    look.id = t.identifier;
    look.lastX = t.clientX;
    look.lastY = t.clientY;
  }, {passive:true});
  lookArea.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === look.id) {
        const dx = t.clientX - look.lastX;
        const dy = t.clientY - look.lastY;
        cameraAngle -= dx * 0.008 * cameraSensitivity;
        cameraPitch = Math.max(-0.4, Math.min(0.9, cameraPitch + dy * 0.005 * cameraSensitivity));
        look.lastX = t.clientX;
        look.lastY = t.clientY;
      }
    }
  }, {passive:true});
  const endLook = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === look.id) look.active = false;
    }
  };
  lookArea.addEventListener('touchend', endLook);
  lookArea.addEventListener('touchcancel', endLook);

  // Кнопки
  const btnRun = document.getElementById('btn-run');
  btnRun.addEventListener('touchstart', e => { e.preventDefault(); player.userData.running = true; btnRun.classList.add('on'); }, {passive:false});
  btnRun.addEventListener('touchend', e => { player.userData.running = false; btnRun.classList.remove('on'); });

  const btnCrouch = document.getElementById('btn-crouch');
  btnCrouch.addEventListener('touchstart', e => {
    e.preventDefault();
    player.userData.crouching = !player.userData.crouching;
    btnCrouch.classList.toggle('on', player.userData.crouching);
    addLog(player.userData.crouching ? 'Вы пригнулись' : 'Вы выпрямились');
  }, {passive:false});

  const btnLook = document.getElementById('btn-look');
  btnLook.addEventListener('touchstart', e => {
    e.preventDefault();
    btnLook.classList.add('on');
    // Осмотр: вращаем камеру вокруг игрока
    let steps = 0;
    const interval = setInterval(() => {
      cameraAngle += 0.15;
      steps++;
      if (steps > 20) { clearInterval(interval); btnLook.classList.remove('on'); }
    }, 30);
    addLog('Вы осматриваетесь');
  }, {passive:false});

  document.getElementById('btn-laugh').addEventListener('touchstart', e => {
    e.preventDefault();
    doLaugh();
  }, {passive:false});

  document.getElementById('btn-interact').addEventListener('touchstart', e => {
    e.preventDefault();
    doInteract();
  }, {passive:false});

  const pauseBtn = document.getElementById('btn-pause');
  pauseBtn.addEventListener('touchstart', e => {
    e.preventDefault();
    document.getElementById('pause-menu').classList.remove('hidden');
  }, {passive:false});

  document.getElementById('resume-btn').addEventListener('click', () => {
    document.getElementById('pause-menu').classList.add('hidden');
  });

  document.getElementById('sens').addEventListener('input', e => cameraSensitivity = parseFloat(e.target.value));
  document.getElementById('vol').addEventListener('input', e => masterVolume = parseFloat(e.target.value));
  document.getElementById('quality').addEventListener('change', e => {
    quality = e.target.value;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'low' ? 1 : quality === 'high' ? 2 : 1.5));
    renderer.shadowMap.enabled = quality !== 'low';
  });
  document.getElementById('hair').addEventListener('change', e => {
    const v = parseInt(e.target.value);
    const hairMat = new THREE.MeshLambertMaterial({ color: [0xff69b4, 0xff44aa, 0x333333][v] });
    player.traverse(o => {
      if (o.isMesh && o.geometry.type === 'SphereGeometry' && o.position.y > 1.9) o.material = hairMat;
    });
  });
  document.getElementById('outfit').addEventListener('change', e => {
    const v = parseInt(e.target.value);
    const shirtMat = new THREE.MeshLambertMaterial({ color: v === 0 ? 0xff69b4 : 0x44aaff });
    player.userData.parts.torso.material = shirtMat;
  });
}

// ---------- Мини-карта ----------
let minimapCtx;
function setupMinimap() {
  const c = document.getElementById('minimap');
  minimapCtx = c.getContext('2d');
}
function drawMinimap() {
  if (!minimapCtx) return;
  const w = 140, h = 140, cx = w/2, cy = h/2, scale = 1.2;
  minimapCtx.clearRect(0, 0, w, h);
  minimapCtx.fillStyle = 'rgba(20,5,15,0.9)';
  minimapCtx.fillRect(0, 0, w, h);
  // Здания
  minimapCtx.fillStyle = '#553344';
  minimapCtx.fillRect(cx-30*scale, cy-30*scale, 25*scale, 18*scale);
  minimapCtx.fillRect(cx+26*scale, cy-25*scale, 18*scale, 14*scale);
  // NPC
  world.npcs.forEach(n => {
    if (n.userData.eliminated) return;
    const dx = (n.position.x - player.position.x) * scale;
    const dz = (n.position.z - player.position.z) * scale;
    if (Math.abs(dx) < w/2 && Math.abs(dz) < h/2) {
      minimapCtx.fillStyle = n === senpai ? '#ffdd44' : (n.userData.type === 'rival' ? '#ff4444' : '#66ccff');
      minimapCtx.beginPath();
      minimapCtx.arc(cx+dx, cy+dz, 3, 0, Math.PI*2);
      minimapCtx.fill();
    }
  });
  // Полиция
  world.police.forEach(p => {
    const dx = (p.position.x - player.position.x) * scale;
    const dz = (p.position.z - player.position.z) * scale;
    minimapCtx.fillStyle = '#2222ff';
    minimapCtx.beginPath();
    minimapCtx.arc(cx+dx, cy+dz, 3.5, 0, Math.PI*2);
    minimapCtx.fill();
  });
  // Игрок
  minimapCtx.fillStyle = '#ff69b4';
  minimapCtx.beginPath();
  minimapCtx.arc(cx, cy, 4, 0, Math.PI*2);
  minimapCtx.fill();
  // Направление
  minimapCtx.strokeStyle = '#fff';
  minimapCtx.beginPath();
  minimapCtx.moveTo(cx, cy);
  minimapCtx.lineTo(cx + Math.sin(player.rotation.y)*10, cy + Math.cos(player.rotation.y)*10);
  minimapCtx.stroke();
}

// ---------- Игровые действия ----------
function doLaugh() {
  if (player.userData.laughCooldown > 0) return;
  player.userData.laughCooldown = 1.5;
  addLog('😈 Вы зловеще рассмеялись!');
  playTone(220, 0.4, 0.05);
  playTone(180, 0.4, 0.2);

  // Реакция NPC
  let witnesses = 0;
  world.npcs.forEach(n => {
    if (n === player || n.userData.eliminated) return;
    const d = n.position.distanceTo(player.position);
    if (d < 15) {
      const toPlayer = new THREE.Vector3().subVectors(player.position, n.position).normalize();
      const forward = new THREE.Vector3(Math.sin(n.rotation.y), 0, Math.cos(n.rotation.y));
      const dot = toPlayer.dot(forward);
      if (dot > 0.3 || d < 6) {
        witnesses++;
        // поворот к игроку
        n.userData.state = 'watching';
        const ang = Math.atan2(toPlayer.x, toPlayer.z);
        n.rotation.y = ang;
        // реплики
        const reactions = ['Она что, чокнутая?', 'Почему она так смеётся?', 'Мне здесь не нравится...', 'Что с ней?', 'Странная...'];
        if (Math.random() < 0.5) {
          addLog(n.userData.name + ': "' + reactions[Math.floor(Math.random()*reactions.length)] + '"');
        }
        // повышение подозрения
        n.userData.suspicionOfPlayer = Math.min(100, (n.userData.suspicionOfPlayer||0) + 8);
        suspicion = Math.min(100, suspicion + 2);
      }
    }
  });

  if (witnesses > 3) {
    suspicion = Math.min(100, suspicion + 10);
    addLog('⚠ Много свидетелей! Подозрение растёт.');
    checkWitnessAlarm();
  }
}

function doInteract() {
  // Ближайший NPC
  let closest = null, minD = 3.5;
  world.npcs.forEach(n => {
    if (n === player || n.userData.eliminated) return;
    const d = n.position.distanceTo(player.position);
    if (d < minD) { minD = d; closest = n; }
  });

  if (closest) {
    openDialog(closest);
    return;
  }

  // Ближайшая соперница для устранения (если очень близко и скрытно)
  let targetRival = null, minDR = 2.5;
  world.rivals.forEach(r => {
    if (r.userData.eliminated) return;
    const d = r.position.distanceTo(player.position);
    if (d < minDR) { minDR = d; targetRival = r; }
  });

  if (targetRival) {
    attemptElimination(targetRival);
    return;
  }

  addLog('Рядом никого нет.');
}

function openDialog(npc) {
  const dlg = document.getElementById('dialog');
  const nameEl = document.getElementById('dialog-name');
  const textEl = document.getElementById('dialog-text');
  const btnsEl = document.getElementById('dialog-buttons');
  dlg.classList.remove('hidden');
  btnsEl.innerHTML = '';

  if (npc === senpai) {
    nameEl.textContent = 'Сэмпай';
    const rel = npc.userData.relationship;
    if (rel < 10) {
      textEl.textContent = 'Привет... ты новенькая? Извини, мне надо идти.';
    } else if (rel < 40) {
      textEl.textContent = 'О, привет! Ты часто здесь бываешь. Как дела?';
    } else if (rel < 80) {
      textEl.textContent = 'Я рад тебя видеть. Хочешь поговорить?';
    } else {
      textEl.textContent = 'Я... думаю о тебе. Может, встретимся после школы?';
    }
    const btnTalk = document.createElement('button');
    btnTalk.textContent = 'Поговорить (+отношения)';
    btnTalk.onclick = () => {
      npc.userData.relationship = Math.min(100, npc.userData.relationship + 5);
      reputation = Math.min(100, reputation + 1);
      addLog('Отношения с Сэмпаем улучшились');
      playTone(660, 0.15, 0.05);
      dlg.classList.add('hidden');
    };
    const btnGift = document.createElement('button');
    btnGift.textContent = 'Сделать комплимент';
    btnGift.onclick = () => {
      if (suspicion > 50) {
        textEl.textContent = 'Сэмпай насторожен... Слишком много странностей вокруг тебя.';
      } else {
        npc.userData.relationship = Math.min(100, npc.userData.relationship + 3);
        addLog('Сэмпай улыбнулся!');
      }
      dlg.classList.add('hidden');
    };
    btnsEl.appendChild(btnTalk);
    btnsEl.appendChild(btnGift);
  } else if (npc.userData.type === 'rival') {
    nameEl.textContent = npc.userData.name;
    const person = npc.userData.personality;
    const lines = {
      cheerful: 'Привет-привет! Какой чудесный день, правда?',
      tsundere: 'Ч-что тебе надо? Не то чтобы я хотела поговорить...',
      shy: 'Ой... п-привет... я просто... тут стою...',
      cold: '...Что? Я занята.',
      energetic: 'Эй! Ты новенькая? Пойдём бегать!'
    };
    textEl.textContent = lines[person] || '...';
    const btnLeave = document.createElement('button');
    btnLeave.textContent = 'Уйти';
    btnLeave.onclick = () => dlg.classList.add('hidden');
    const btnProvoke = document.createElement('button');
    btnProvoke.textContent = 'Спросить о Сэмпае';
    btnProvoke.onclick = () => {
      if (npc.userData.relationshipWithSenpai > 40) {
        textEl.textContent = 'Он такой милый... Мы очень близки. Не вмешивайся.';
        npc.userData.suspicionOfPlayer += 10;
      } else {
        textEl.textContent = 'Сэмпай? Он просто одноклассник.';
      }
    };
    btnsEl.appendChild(btnLeave);
    btnsEl.appendChild(btnProvoke);
  } else {
    nameEl.textContent = npc.userData.name;
    textEl.textContent = 'Привет! Урок скоро начнётся, ты не забыла?';
    const btn = document.createElement('button');
    btn.textContent = 'Пока';
    btn.onclick = () => dlg.classList.add('hidden');
    btnsEl.appendChild(btn);
  }

  if (typeof playTone === 'function') playTone(440, 0.1, 0.04);
}

function attemptElimination(rival) {
  const dlg = document.getElementById('dialog');
  const nameEl = document.getElementById('dialog-name');
  const textEl = document.getElementById('dialog-text');
  const btnsEl = document.getElementById('dialog-buttons');
  dlg.classList.remove('hidden');
  btnsEl.innerHTML = '';
  nameEl.textContent = rival.userData.name;

  // Проверка свидетелей
  let witnesses = 0;
  world.npcs.forEach(n => {
    if (n === player || n === rival || n.userData.eliminated) return;
    const d = n.position.distanceTo(player.position);
    if (d < 12) {
      const toPlayer = new THREE.Vector3().subVectors(player.position, n.position).normalize();
      const forward = new THREE.Vector3(Math.sin(n.rotation.y), 0, Math.cos(n.rotation.y));
      if (toPlayer.dot(forward) > 0) witnesses++;
    }
  });

  if (player.userData.crouching && witnesses === 0) {
    textEl.textContent = 'Вы скрытно устранили соперницу. Никто не видел.';
    rival.userData.eliminated = true;
    rival.visible = false;
    addLog('🗡 ' + rival.userData.name + ' устранена. Никто не видел.');
    reputation = Math.max(0, reputation - 5);
    // Сэмпай реагирует
    senpai.userData.relationship = Math.max(0, senpai.userData.relationship - 2);
    updateQuest('Сэмпай выглядит опечаленным. Утешь его.');
    // Реакция друзей
    world.npcs.forEach(n => {
      if (n.userData.type === 'npc' && Math.random() < 0.3) {
        n.userData.state = 'seeking_help';
      }
    });
    const btn = document.createElement('button');
    btn.textContent = 'OK';
    btn.onclick = () => dlg.classList.add('hidden');
    btnsEl.appendChild(btn);
    playTone(110, 0.8, 0.1);
  } else if (witnesses > 0) {
    textEl.textContent = 'Слишком много свидетелей (' + witnesses + '). Пригнитесь и убедитесь, что никто не видит.';
    suspicion = Math.min(100, suspicion + 15);
    addLog('⚠ Вас заметили! Подозрение растёт.');
    rival.userData.suspicionOfPlayer += 30;
    checkWitnessAlarm();
    const btn = document.createElement('button');
    btn.textContent = 'Уйти';
    btn.onclick = () => dlg.classList.add('hidden');
    btnsEl.appendChild(btn);
  } else {
    textEl.textContent = 'Вы не в скрытном режиме. Пригнитесь (🕶) и попробуйте снова.';
    const btn = document.createElement('button');
    btn.textContent = 'OK';
    btn.onclick = () => dlg.classList.add('hidden');
    btnsEl.appendChild(btn);
  }
}

// ---------- Тревога и полиция ----------
function checkWitnessAlarm() {
  // Если кто-то с высоким подозрением и увидел — вызывает полицию
  let report = false;
  world.npcs.forEach(n => {
    if (n.userData.eliminated) return;
    if ((n.userData.suspicionOfPlayer || 0) > 30) {
      const d = n.position.distanceTo(player.position);
      if (d < 20) report = true;
    }
  });
  if (report && !alarmActive && Math.random() < 0.3) triggerAlarm();
}

function triggerAlarm() {
  alarmActive = true;
  alarmTriggered = true;
  alarmTimer = 30; // секунд до прибытия
  document.getElementById('alarm').classList.remove('hidden');
  document.getElementById('police-timer').classList.remove('hidden');
  addLog('🚨 Свидетель вызвал полицию!');
  playTone(880, 0.3, 0.1);
  playTone(660, 0.3, 0.15);
  // NPC реагируют
  world.npcs.forEach(n => {
    if (n.userData.eliminated) return;
    if (n.userData.type === 'rival') n.userData.state = 'fleeing';
    else n.userData.state = 'seeking_help';
  });
}

function spawnPolice() {
  const spawnPos = new THREE.Vector3(0, 0, 45);
  for (let i=0;i<3;i++) {
    const cop = buildHumanoid({ hair: 0x222222, shirt: 0x223388, skirt: 0x111133, skin:0xffe0c0, eye:0x000033 });
    cop.position.copy(spawnPos).add(new THREE.Vector3((i-1)*2, 0, 0));
    // Фуражка
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 0.15, 12),
      new THREE.MeshLambertMaterial({ color: 0x111133 })
    );
    cap.position.y = 2.45;
    cop.add(cap);
    scene.add(cop);
    cop.userData = {
      ...cop.userData,
      velocity: new THREE.Vector3(),
      speed: 3,
      target: new THREE.Vector3(0, 0, 20),
      state: 'investigating',
      animTime: 0,
      type: 'police'
    };
    world.police.push(cop);
    world.npcs.push(cop);
  }
  document.getElementById('alarm').classList.add('hidden');
  document.getElementById('police-timer').classList.add('hidden');
  addLog('👮 Полиция прибыла на территорию!');
  updateQuest('Полиция ищет свидетелей. Не попадайтесь на глаза.');

  // Через 45 секунд — расследование завершается
  setTimeout(() => {
    endInvestigation();
  }, 45000);
}

function endInvestigation() {
  const caught = world.police.some(p => p.position.distanceTo(player.position) < 6);
  if (caught) {
    addLog('👮 Полиция задержала вас. Расследование завершено.');
    reputation = Math.max(0, reputation - 30);
    updateQuest('Вы были задержаны. Репутация упала.');
    showEnd('Задержание', 'Полиция нашла улики против вас. Репутация упала, но игра продолжается. Постарайтесь улучшить отношения с Сэмпаем.');
  } else {
    addLog('👮 Полиция не нашла улик.');
    updateQuest('Полиция уехала. Продолжайте действовать скрытно.');
  }
  alarmActive = false;
  alarmTriggered = false;
  // Полиция уходит
  world.police.forEach(p => {
    p.userData.state = 'leaving';
    p.userData.target = new THREE.Vector3(0, 0, 50);
  });
  setTimeout(() => {
    world.police.forEach(p => {
      scene.remove(p);
    });
    world.police.length = 0;
  }, 6000);
}

// ---------- Звук ----------
let audioCtx = null;
function initAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
}
function playTone(freq, dur, vol) {
  if (!audioCtx) initAudio();
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.value = (vol || 0.05) * masterVolume;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
  osc.stop(audioCtx.currentTime + dur);
}

// ---------- Журнал и UI ----------
function addLog(text) {
  const box = document.getElementById('log-box');
  const el = document.createElement('div');
  el.className = 'log-item';
  el.textContent = text;
  box.appendChild(el);
  setTimeout(() => el.remove(), 5000);
  while (box.children.length > 4) box.removeChild(box.firstChild);
}
function updateQuest(text) {
  document.getElementById('quest-text').textContent = text;
}
function showEnd(title, text) {
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-text').textContent = text;
  document.getElementById('end-screen').classList.remove('hidden');
  document.getElementById('end-btn').onclick = () => {
    document.getElementById('end-screen').classList.add('hidden');
  };
}

// ---------- Движение с коллизиями ----------
function moveWithCollision(obj, dx, dz) {
  const r = 0.5;
  const tryX = obj.position.x + dx;
  let canX = true;
  world.walls.forEach(w => {
    if (tryX + r > w.minX && tryX - r < w.maxX && obj.position.z + r > w.minZ && obj.position.z - r < w.maxZ) {
      canX = false;
    }
  });
  if (canX) obj.position.x = tryX;

  const tryZ = obj.position.z + dz;
  let canZ = true;
  world.walls.forEach(w => {
    if (obj.position.x + r > w.minX && obj.position.x - r < w.maxX && tryZ + r > w.minZ && tryZ - r < w.maxZ) {
      canZ = false;
    }
  });
  if (canZ) obj.position.z = tryZ;

  // Границы мира
  obj.position.x = Math.max(-48, Math.min(48, obj.position.x));
  obj.position.z = Math.max(-48, Math.min(48, obj.position.z));
}

// ---------- Анимация персонажей ----------
function animateHumanoid(obj, moving, dt, runSpeed) {
  const parts = obj.userData.parts;
  if (!parts) return;
  if (moving) {
    obj.userData.animTime += dt * (runSpeed ? 12 : 7);
    const s = Math.sin(obj.userData.animTime);
    parts.legL.rotation.x = s * 0.6;
    parts.legR.rotation.x = -s * 0.6;
    parts.armL.rotation.x = -s * 0.5;
    parts.armR.rotation.x = s * 0.5;
  } else {
    obj.userData.animTime += dt * 2;
    const idle = Math.sin(obj.userData.animTime) * 0.1;
    parts.legL.rotation.x *= 0.9;
    parts.legR.rotation.x *= 0.9;
    parts.armL.rotation.x = idle;
    parts.armR.rotation.x = -idle;
  }
}

// ---------- Основной цикл ----------
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  // Игровое время: 1 реальная секунда = 1 игровая минута
  gameTime += dt * 1;
  if (gameTime >= 24*60) gameTime -= 24*60;

  // Таймер тревоги
  if (alarmActive && !alarmTriggered) {
    alarmTimer -= dt;
    document.getElementById('police-timer').textContent = '👮 Полиция через: ' + Math.ceil(alarmTimer) + 'с';
    if (alarmTimer <= 0) {
      spawnPolice();
    }
  }

  // Управление игроком
  updatePlayer(dt);
  // NPC
  updateNPCs(dt);
  // Senpai
  updateSenpai(dt);
  // Rivals
  updateRivals(dt);
  // Police
  updatePolice(dt);

  // Камера от третьего лица
  updateCamera(dt);

  // UI
  updateUI();
  drawMinimap();

  renderer.render(scene, camera);
}

function updatePlayer(dt) {
  const ud = player.userData;
  if (ud.laughCooldown > 0) ud.laughCooldown -= dt;

  let speed = ud.speed;
  if (ud.running) speed = ud.runSpeed;
  if (ud.crouching) speed = ud.crouchSpeed;

  // Направление относительно камеры
  const input = new THREE.Vector2(joystick.x, -joystick.y);
  const moving = input.length() > 0.15;

  if (moving) {
    const camDir = new THREE.Vector3(-Math.sin(cameraAngle), 0, -Math.cos(cameraAngle));
    const camRight = new THREE.Vector3(Math.cos(cameraAngle), 0, -Math.sin(cameraAngle));
    const dir = new THREE.Vector3()
      .addScaledVector(camDir, -input.y)
      .addScaledVector(camRight, input.x)
      .normalize();
    const dx = dir.x * speed * dt;
    const dz = dir.z * speed * dt;
    moveWithCollision(player, dx, dz);
    // Поворот к направлению движения
    const targetAngle = Math.atan2(dir.x, dir.z);
    player.rotation.y = lerpAngle(player.rotation.y, targetAngle, dt * 10);
  }
  animateHumanoid(player, moving, dt, ud.running);
  if (ud.crouching) player.position.y = 0;
}

function updateSenpai(dt) {
  const ud = senpai.userData;
  if (ud.talkCooldown > 0) ud.talkCooldown -= dt;

  // Определяем цель по расписанию
  let target = null;
  for (let i = ud.schedule.length - 1; i >= 0; i--) {
    if (gameTime >= ud.schedule[i].time) {
      target = ud.schedule[i].pos;
      break;
    }
  }
  if (target) {
    const d = senpai.position.distanceTo(target);
    if (d > 1) {
      const dir = new THREE.Vector3().subVectors(target, senpai.position);
      dir.y = 0;
      dir.normalize();
      const dx = dir.x * ud.speed * dt;
      const dz = dir.z * ud.speed * dt;
      moveWithCollision(senpai, dx, dz);
      senpai.rotation.y = Math.atan2(dir.x, dir.z);
      animateHumanoid(senpai, true, dt, false);
    } else {
      animateHumanoid(senpai, false, dt, false);
    }
  }

  // Реакция на героиню
  const dPlayer = senpai.position.distanceTo(player.position);
  if (dPlayer < 8) {
    const toPlayer = new THREE.Vector3().subVectors(player.position, senpai.position).normalize();
    const ang = Math.atan2(toPlayer.x, toPlayer.z);
    // Медленный поворот
    senpai.rotation.y = lerpAngle(senpai.rotation.y, ang, dt * 2);
  }
}

function updateRivals(dt) {
  world.rivals.forEach(r => {
    if (r.userData.eliminated) return;
    const ud = r.userData;
    if (ud.talkCooldown > 0) ud.talkCooldown -= dt;

    // Реакция на полицию
    if (world.police.length > 0) {
      // Убегают
      const nearestCop = world.police[0];
      const dir = new THREE.Vector3().subVectors(r.position, nearestCop.position).normalize();
      moveWithCollision(r, dir.x * ud.speed * 1.5 * dt, dir.z * ud.speed * 1.5 * dt);
      r.rotation.y = Math.atan2(dir.x, dir.z);
      animateHumanoid(r, true, dt, true);
      return;
    }

    // Смена цели
    if (r.position.distanceTo(ud.target) < 2) {
      ud.target = new THREE.Vector3(
        (Math.random()-0.5)*60,
        0,
        (Math.random()-0.5)*60
      );
    }

    // Движение к цели
    const dir = new THREE.Vector3().subVectors(ud.target, r.position);
    dir.y = 0;
    if (dir.length() > 0.5) {
      dir.normalize();
      moveWithCollision(r, dir.x * ud.speed * dt, dir.z * ud.speed * dt);
      r.rotation.y = Math.atan2(dir.x, dir.z);
      animateHumanoid(r, true, dt, false);
    } else {
      animateHumanoid(r, false, dt, false);
    }

    // Замечают игрока
    const d = r.position.distanceTo(player.position);
    if (d < 10) {
      const toPlayer = new THREE.Vector3().subVectors(player.position, r.position).normalize();
      const forward = new THREE.Vector3(Math.sin(r.rotation.y), 0, Math.cos(r.rotation.y));
      if (toPlayer.dot(forward) > 0.5) {
        ud.suspicionOfPlayer = Math.min(100, ud.suspicionOfPlayer + dt * 5);
        if (suspicion > 50) {
          ud.state = 'watching';
        }
      }
    }
  });
}

function updateNPCs(dt) {
  world.npcs.forEach(n => {
    if (n === senpai || n.userData.type === 'rival' || n.userData.type === 'police') return;
    if (n.userData.eliminated) return;
    const ud = n.userData;

    // Полиция: убегают или ищут
    if (world.police.length > 0) {
      if (ud.state !== 'hiding') {
        ud.target = new THREE.Vector3(
          (Math.random()-0.5)*60,
          0,
          (Math.random()-0.5)*60
        );
        ud.state = 'hiding';
      }
    } else if (ud.state === 'hiding') {
      ud.state = 'idle';
    }

    if (ud.state === 'seeking_help' && world.police.length === 0) {
      // Идёт к "учителю" (упрощённо — к главному зданию)
      ud.target = new THREE.Vector3(-30, 0, -22);
      if (n.position.distanceTo(ud.target) < 2) {
        ud.state = 'idle';
        if (Math.random() < 0.1) triggerAlarm();
      }
    }

    // Смена цели
    if (n.position.distanceTo(ud.target) < 1.5) {
      if (ud.state === 'idle' || ud.state === 'hiding') {
        ud.target = new THREE.Vector3(
          (Math.random()-0.5)*60,
          0,
          (Math.random()-0.5)*60
        );
      }
    }

    // Движение
    const dir = new THREE.Vector3().subVectors(ud.target, n.position);
    dir.y = 0;
    if (dir.length() > 0.5) {
      dir.normalize();
      moveWithCollision(n, dir.x * ud.speed * dt, dir.z * ud.speed * dt);
      n.rotation.y = Math.atan2(dir.x, dir.z);
      animateHumanoid(n, true, dt, false);
    } else {
      animateHumanoid(n, false, dt, false);
    }

    // Реакция на игрока
    const d = n.position.distanceTo(player.position);
    if (d < 8 && !alarmActive) {
      const toPlayer = new THREE.Vector3().subVectors(player.position, n.position).normalize();
      const forward = new THREE.Vector3(Math.sin(n.rotation.y), 0, Math.cos(n.rotation.y));
      if (toPlayer.dot(forward) > 0.4) {
        n.rotation.y = lerpAngle(n.rotation.y, Math.atan2(toPlayer.x, toPlayer.z), dt * 3);
        ud.suspicionOfPlayer += dt * 3;
      }
    }
  });
}

function updatePolice(dt) {
  world.police.forEach(p => {
    const ud = p.userData;
    if (ud.state === 'leaving') {
      // Уходят
      const dir = new THREE.Vector3().subVectors(ud.target, p.position);
      dir.y = 0;
      if (dir.length() > 1) {
        dir.normalize();
        p.position.x += dir.x * ud.speed * 1.5 * dt;
        p.position.z += dir.z * ud.speed * 1.5 * dt;
        p.rotation.y = Math.atan2(dir.x, dir.z);
        animateHumanoid(p, true, dt, true);
      }
      return;
    }
    // Ищут игрока
    const dir = new THREE.Vector3().subVectors(player.position, p.position);
    dir.y = 0;
    const dist = dir.length();
    if (dist > 4) {
      dir.normalize();
      moveWithCollision(p, dir.x * ud.speed * dt, dir.z * ud.speed * dt);
      p.rotation.y = Math.atan2(dir.x, dir.z);
      animateHumanoid(p, true, dt, false);
    } else {
      animateHumanoid(p, false, dt, false);
    }
  });
}

function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI*2;
  while (diff < -Math.PI) diff += Math.PI*2;
  return a + diff * Math.min(t, 1);
}

function updateCamera(dt) {
  // Позиция за игроком
  const offsetX = Math.sin(cameraAngle) * cameraDist;
  const offsetZ = Math.cos(cameraAngle) * cameraDist;
  const offsetY = cameraHeight + cameraPitch * 3;

  const targetX = player.position.x + offsetX;
  const targetZ = player.position.z + offsetZ;
  const targetY = player.position.y + offsetY;

  camera.position.x += (targetX - camera.position.x) * Math.min(dt * 8, 1);
  camera.position.y += (targetY - camera.position.y) * Math.min(dt * 8, 1);
  camera.position.z += (targetZ - camera.position.z) * Math.min(dt * 8, 1);

  camera.lookAt(player.position.x, player.position.y + 1.8, player.position.z);
}

function updateUI() {
  // Время
  const h = Math.floor(gameTime / 60) % 24;
  const m = Math.floor(gameTime % 60);
  document.getElementById('clock').textContent = 
    String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');

  // Репутация
  document.getElementById('reputation').textContent = '♡ Репутация: ' + Math.round(reputation);

  // Подозрение
  let displaySuspicion = suspicion;
  world.npcs.forEach(n => {
    if (n.userData.eliminated) return;
    if (n.userData.suspicionOfPlayer > 30) displaySuspicion = Math.max(displaySuspicion, n.userData.suspicionOfPlayer);
  });
  document.getElementById('suspicion').textContent = '👁 Подозрение: ' + Math.round(displaySuspicion) + '%';
}

// Инициализация аудио по первому касанию
document.addEventListener('touchstart', function once() {
  initAudio();
  document.removeEventListener('touchstart', once);
}, { once: true });
document.addEventListener('click', function once() {
  initAudio();
  document.removeEventListener('click', once);
}, { once: true });

// Проверка тревоги раз в несколько секунд
setInterval(() => {
  if (!alarmActive && suspicion > 60 && Math.random() < 0.15) {
    checkWitnessAlarm();
  }
}, 5000);