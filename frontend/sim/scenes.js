// TutinGuard 3D — extra demo buildings: school, hospital, shopping mall, dormitory.
// Every building is a 14 × 10 m section with the main exit in the south wall at x ≈ 6.25 (the fire truck parks there).
// Coordinates: x → east, z → south, metres. The office scene stays in index.html.
const CEIL = 2.86;
const W = (axis, c, a0, a1, t, ops = [], kind) => ({ axis, c, a0, a1, t, ops, ...(kind ? { kind } : {}) });
const win = (s, e, b = .9, t = 2.3) => [s, e, b, t, 'win'];
const door = (s, e, dir = 1, t = 2.1) => [s, e, 0, t, 'door', dir];
const exit = (s, e, dir = 1) => [s, e, 0, 2.15, 'exit', dir];
const arch = (s, e, t = 2.5) => [s, e, 0, t, 'arch'];

// ---------- shared furniture builders (H = helpers from index.html) ----------
function kit(H) {
  const { rb, cyl, mesh, M, std, S, THREE, PI, RB, CYL } = H;
  const grp = (x, z, ry = 0) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; S.add(g); return g; };
  const foot = (x, z, w, d, ry = 0) => { const sw = Math.abs(Math.sin(ry)) > .5; const hw = (sw ? d : w) / 2, hd = (sw ? w : d) / 2; H.block(x - hw, z - hd, x + hw, z + hd); };
  const mats = {
    board: std({ color: 0x23412f, roughness: .9 }), frameW: std({ color: 0xe9e6df, roughness: .5 }), blanketA: std({ color: 0x8fb3d9, roughness: .95 }),
    blanketB: std({ color: 0xc9b38d, roughness: .95 }), blanketC: std({ color: 0x9fc9a8, roughness: .95 }), mattress: std({ color: 0xf3f1ea, roughness: .95 }),
    card: std({ color: 0xb08a5a, roughness: .95 }), steel: std({ color: 0xc9ced3, roughness: .3, metalness: .7 }), green: std({ color: 0x2f8f5b, roughness: .5 }),
    tile: std({ color: 0xdfe6ea, roughness: .4 }), wood2: std({ color: 0x9a6b43, roughness: .6 }), yellow: std({ color: 0xe8b900, roughness: .5 }),
  };
  const hz = (c = 0x9aa1a8, e = 0xff5a00, o = {}) => std({ color: c, roughness: .5, emissive: e, emissiveIntensity: 0, ...o });
  const B = {
    mats, hz, grp, foot,
    desk(x, z, w = 1.2, d = .5, ry = 0, top = M.wood) { const g = grp(x, z, ry); rb(w, .04, d, top, 0, .72, 0, .008, g); for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(.018, .018, .7, M.darkMetal, sx * (w / 2 - .05), .35, sz * (d / 2 - .05), g, 6); rb(w - .1, .25, .015, M.grey, 0, .55, d / 2 - .04, .004, g); foot(x, z, w, d, ry); return g; },
    table(x, z, r = .45, mat = M.wood) { cyl(r, r, .03, mat, x, .74, z, S, 22); cyl(.035, .035, .72, M.darkMetal, x, .37, z, S, 8); cyl(r * .55, r * .55, .02, M.darkMetal, x, .01, z, S, 16); H.block(x - r * .7, z - r * .7, x + r * .7, z + r * .7); },
    stool(x, z, mat = M.fabricTeal) { cyl(.17, .17, .04, mat, x, .62, z, S, 14); cyl(.02, .02, .6, M.metal, x, .31, z, S, 6); cyl(.16, .16, .015, M.metal, x, .008, z, S, 12); },
    bench(x, z, w = 1.6, ry = 0) { const g = grp(x, z, ry); rb(w, .05, .38, M.wood, 0, .45, 0, .01, g); for (const s of [-1, 1]) rb(.05, .45, .34, M.darkMetal, s * (w / 2 - .1), .22, 0, .01, g); foot(x, z, w, .38, ry); },
    shelf(x, z, w = 1.6, d = .45, h = 1.9, ry = 0, fill = M.card, levels = 4) {
      const g = grp(x, z, ry); for (const s of [-1, 1]) rb(.04, h, d, M.grey, s * w / 2, h / 2, 0, .006, g);
      for (let i = 0; i <= levels; i++) rb(w, .025, d, M.grey, 0, .05 + i * (h - .1) / levels, 0, .004, g);
      for (let i = 0; i < levels; i++) { let xx = -w / 2 + .08; while (xx < w / 2 - .2) { const bw = .18 + H.rnd() * .22, bh = .15 + H.rnd() * (h / levels - .3); if (H.rnd() < .85) rb(bw, bh, d * .8, fill, xx + bw / 2, .065 + i * (h - .1) / levels + bh / 2, 0, .01, g); xx += bw + .04; } }
      foot(x, z, w, d, ry); return g;
    },
    wardrobe(x, z, w = 1.0, ry = 0, mat = M.cabinet) { const g = grp(x, z, ry); rb(w, 2.0, .55, mat, 0, 1.0, 0, .01, g); rb(.012, 1.9, .01, M.darkMetal, 0, 1.0, .28, .002, g); for (const s of [-1, 1]) rb(.02, .2, .03, M.alu, s * .06, 1.05, .29, .006, g); foot(x, z, w, .55, ry); },
    bed(x, z, ry = 0, blanket = mats.blanketA, hospital = false) {
      const g = grp(x, z, ry); // along local z, head at -z
      rb(.95, hospital ? .5 : .32, 2.02, hospital ? mats.frameW : M.wood, 0, hospital ? .3 : .2, 0, .02, g);
      rb(.9, .14, 1.95, mats.mattress, 0, hospital ? .62 : .43, 0, .05, g);
      rb(.92, .06, 1.35, blanket, 0, hospital ? .71 : .52, .28, .03, g);
      rb(.55, .1, .32, M.white, 0, hospital ? .74 : .55, -.78, .05, g);
      rb(.95, hospital ? 1.0 : .8, .05, hospital ? mats.frameW : M.wood, 0, hospital ? .55 : .45, -1.0, .02, g);
      if (hospital) { for (const s of [-1, 1]) rb(.04, .25, 1.0, mats.steel, s * .5, .85, .1, .01, g); for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(.05, .05, .06, M.black, sx * .4, .03, sz * .9, g, 10); }
      foot(x, z, .95, 2.05, ry); return g;
    },
    ivStand(x, z) { cyl(.012, .012, 1.9, mats.steel, x, .95, z, S, 6); cyl(.18, .18, .02, mats.steel, x, .03, z, S, 5); rb(.12, .2, .05, M.glassBlue, x + .06, 1.75, z, .02); },
    nightstand(x, z) { rb(.45, .55, .4, M.cabinet, x, .275, z, .01); H.block(x - .22, z - .2, x + .22, z + .2); },
    counter(x, z, w, d = .6, ry = 0, mat = M.cabinet, top = M.stone, h = .9) { const g = grp(x, z, ry); rb(w, h - .04, d, mat, 0, (h - .04) / 2, 0, .01, g); rb(w + .04, .04, d + .04, top, 0, h - .02, 0, .01, g); foot(x, z, w, d, ry); return g; },
    stove(x, z, ry = 0, mat = M.metal) { const g = grp(x, z, ry); rb(.6, .85, .6, mat, 0, .425, 0, .02, g); rb(.58, .02, .55, M.blackGlass, 0, .86, 0, .005, g); for (const [a, b] of [[-.14, -.13], [.14, -.13], [-.14, .13], [.14, .13]]) cyl(.08, .08, .01, M.darkMetal, a, .875, b, g, 16); foot(x, z, .6, .6, ry); return g; },
    fryer(x, z, mat, ry = 0) { const g = grp(x, z, ry); rb(.5, .85, .6, mats.steel, 0, .425, 0, .02, g); rb(.4, .14, .45, mat, 0, .9, 0, .01, g); for (const s of [-1, 1]) rb(.15, .04, .3, M.darkMetal, s * .1, 1.0, 0, .01, g); rb(.7, .4, .7, mats.steel, 0, 2.3, -.05, .02, g); foot(x, z, .5, .6, ry); return g; },
    fridge(x, z, ry = 0) { const g = grp(x, z, ry); rb(.66, 1.85, .66, M.metal, 0, .925, 0, .02, g); rb(.02, .5, .03, M.darkMetal, -.24, 1.2, .34, .006, g); foot(x, z, .66, .66, ry); },
    washer(x, z, ry = 0, mat = M.white) { const g = grp(x, z, ry); rb(.6, .85, .6, mat, 0, .425, 0, .03, g); cyl(.2, .2, .02, M.blackGlass, 0, .45, .3, g, 24).rotation.x = PI / 2; rb(.5, .06, .02, M.darkMetal, 0, .78, .3, .005, g); foot(x, z, .6, .6, ry); return g; },
    board(x, z, w = 3, ry = 0) { const g = grp(x, z, ry); rb(w, 1.1, .04, mats.board, 0, 1.5, 0, .01, g); rb(w + .08, .05, .08, M.alu, 0, .93, .02, .01, g); },
    cylinder(x, z, mat, h = 1.4) { cyl(.11, .11, h, mat, x, h / 2, z, S, 14); cyl(.04, .05, .14, mats.steel, x, h + .06, z, S, 8); },
    stall(x0, z0, z1) { rb(.05, 1.9, z1 - z0, M.cabinet, x0, 1.0, (z0 + z1) / 2, .01); H.block(x0 - .05, z0, x0 + .05, z1); },
    sink(x, z, ry = 0) { const g = grp(x, z, ry); rb(.55, .16, .42, M.white, 0, .82, 0, .04, g); cyl(.015, .015, .2, M.metal, 0, .98, -.15, g, 6); rb(.08, .7, .08, M.white, 0, .37, -.1, .01, g); },
    rack(x, z, w = 1.4, ry = 0, colors = [0x5a7fa8, 0xa85a5a, 0x5aa87b, 0xd9c27a, 0x333333]) {
      const g = grp(x, z, ry); for (const s of [-1, 1]) cyl(.015, .015, 1.5, M.alu, s * w / 2, .75, 0, g, 6); cyl(.012, .012, w, M.alu, 0, 1.45, 0, g, 6).rotation.z = PI / 2;
      for (let i = 0; i < Math.floor(w / .09); i++) rb(.035, .75, .42, std({ color: colors[i % colors.length], roughness: .9 }), -w / 2 + .08 + i * .09, 1.05, 0, .01, g);
      foot(x, z, w, .45, ry);
    },
    sign(text, x, y, z, ry = 0, bg = '#0f6e56', w = 1.6) {
      const c = H.textCanvas(text, { font: 'bold 34px system-ui', bg, pad: 24, r: 6 }), t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const m = mesh(new THREE.PlaneGeometry(w, w * c.height / c.width), std({ map: t, roughness: .5 }), x, y, z, S, false); m.rotation.y = ry; return m;
    },
  };
  return B;
}

export const SCENES = {
  // ======================================================================= SCHOOL
  school: {
    site_id: 'kzo-school-12', name: 'Школа-лицей №12 (демо)', short: 'Школа', kind: 'school',
    names: ['Учитель', 'Әлихан', 'Аружан', 'Нұрислам', 'Томирис', 'Ерасыл', 'Айша', 'Мадияр', 'Информатик', 'Дана', 'Санжар', 'Охранник', 'Повар'],
    zones: [
      { id: 'sch-cls', name: 'Класс 2-04', type: 'classroom', x0: 0, z0: 0, x1: 6, z1: 6, floor: 'linoleum', tile: 1.5 },
      { id: 'sch-it', name: 'Кабинет информатики', type: 'classroom', x0: 6, z0: 0, x1: 14, z1: 6, floor: 'linoleum', tile: 1.5 },
      { id: 'sch-cor', name: 'Коридор', type: 'hall', x0: 0, z0: 6, x1: 14, z1: 7.6, floor: 'linoleum', tile: 1.5 },
      { id: 'sch-wc', name: 'Туалет', type: 'wc', x0: 0, z0: 7.6, x1: 3, z1: 10, floor: 'kitTile', tile: 1.2 },
      { id: 'sch-lob', name: 'Вестибюль · охрана', type: 'hall', x0: 3, z0: 7.6, x1: 8, z1: 10, floor: 'marble', tile: 2 },
      { id: 'sch-food', name: 'Столовая', type: 'kitchen', x0: 8, z0: 7.6, x1: 14, z1: 10, floor: 'kitTile', tile: 1.2 },
    ],
    walls: [
      W('x', 0, -.1, 14.1, .2, [win(.8, 2.4), win(3.3, 4.9), win(7.0, 8.6), win(9.6, 11.2), win(12.1, 13.5)]),
      W('x', 10, -.1, 14.1, .2, [exit(5.75, 6.75, -1), win(9.2, 10.6), win(11.8, 13.2), win(.8, 2.0, 1.5)]),
      W('z', 0, .1, 9.9, .2, [win(1.4, 3.6), exit(6.3, 7.3, 1)]),
      W('z', 14, .1, 9.9, .2, [win(1.4, 3.6), win(8.1, 9.4)]),
      W('x', 6, .1, 13.9, .12, [door(4.4, 5.3), door(7.0, 7.9)]),
      W('z', 6, .1, 5.94, .12),
      W('x', 7.6, .1, 13.9, .12, [door(1.0, 1.85, -1), arch(3.6, 7.6), arch(9.0, 11.0)]),
      W('z', 3, 7.66, 9.9, .12), W('z', 8, 7.66, 9.9, .12),
    ],
    adj: [['sch-cls', 'sch-cor'], ['sch-it', 'sch-cor'], ['sch-cor', 'sch-wc'], ['sch-cor', 'sch-lob'], ['sch-cor', 'sch-food']],
    sensors: [
      ['SCH-SMK-01', 'smoke', 1.6, CEIL, 2.0], ['SCH-SMK-02', 'smoke', 4.4, CEIL, 4.3], ['SCH-MLT-01', 'multi', 3.0, CEIL, 3.2],
      ['SCH-SMK-03', 'smoke', 8.4, CEIL, 2.0], ['SCH-SMK-04', 'smoke', 12.0, CEIL, 4.2], ['SCH-MLT-02', 'multi', 10.2, CEIL, 3.0],
      ['SCH-SMK-05', 'smoke', 3.0, CEIL, 6.8], ['SCH-SMK-06', 'smoke', 10.5, CEIL, 6.8],
      ['SCH-SMK-07', 'smoke', 1.5, CEIL, 8.8], ['SCH-SMK-08', 'smoke', 5.5, CEIL, 8.8],
      ['SCH-SMK-09', 'smoke', 10.0, CEIL, 8.8], ['SCH-HT-01', 'heat', 12.8, CEIL, 8.6], ['SCH-CO-01', 'gas_co', 13.885, 1.55, 9.5, -Math.PI / 2],
      ['SCH-MCP-01', 'manual', .115, 1.5, 7.48, Math.PI / 2], ['SCH-MCP-02', 'manual', 7.3, 1.5, 9.885, Math.PI], ['SCH-PNL-01', 'panel', 3.075, 1.5, 8.5, Math.PI / 2],
    ],
    sirens: [[3, 2.45, 5.935, Math.PI], [10.5, 2.45, 5.935, Math.PI], [7, 2.45, 7.535, Math.PI], [1.5, 2.45, 9.885, Math.PI], [5, 2.45, 9.885, Math.PI], [11, 2.45, 9.885, Math.PI]],
    exitSigns: [[6.25, 9.885, Math.PI], [.115, 6.8, Math.PI / 2]],
    exits: [{ out: [6.25, 11.3], assembly: [2.9, 12.6] }, { out: [-1.3, 6.8], assembly: [-3.2, 4.2] }],
    build(H) {
      const B = kit(H), { M, rb, cyl, chair, S, PI, std } = H, m = this.mats = {
        cart: B.hz(0x3a4a5c, 0xff5a00), strip: B.hz(0xf2f2f0), fryer: B.hz(0x2b2b2b, 0xff7a00), bin: B.hz(0x4b5563, 0xff6a00), vape: std({ color: 0x9ca3af }),
      };
      // classroom: board, teacher, 3 rows of desks
      B.board(3, .13, 3.2); B.desk(1.3, 1.3, 1.2, .6, 0, M.walnut); chair(S, 1.3, .78, 0, M.leather); H.seat(1.3, .78, 0, 'Учитель');
      let n = 0;
      for (const z of [2.6, 3.8, 5.0]) for (const x of [1.6, 4.3]) {
        B.desk(x, z, 1.2, .5); for (const s of [-1, 1]) { chair(S, x + s * .3, z + .45, PI, M.fabricBlue); if (z < 5 && n < 6 && !(z === 3.8 && s === 1 && x === 4.3)) { H.seat(x + s * .3, z + .45, PI, null); n++; } }
      }
      rb(.42, .045, .075, m.strip, .3, .025, 4.4, .012); // power strip by the window (hazard 4)
      B.shelf(5.5, .4, 1.0, .35, 1.8, 0, M.paper, 4); H.extinguisher(.35, 5.6);
      // IT room: PCs along north and east walls, laptop charging cart
      for (const x of [7.4, 9.0, 10.6]) H.ws(x, .85, PI, { w: 1.3, d: .65, scr: Math.floor(x) % 3, cmat: M.fabric }, x === 9.0 ? 'Информатик' : null, x !== 10.6);
      for (const z of [2.6, 4.2]) H.ws(13.15, z, PI / 2, { w: 1.3, d: .65, scr: 1, cmat: M.fabricTeal }, null, z === 2.6);
      rb(1.0, 1.05, .55, m.cart, 9.6, .53, 5.55, .03); for (let i = 0; i < 6; i++) rb(.02, .7, .4, M.darkMetal, 9.2 + i * .15, .6, 5.55, .004); H.block(9.1, 5.25, 10.1, 5.85);
      B.table(11.2, 3.6, .55, M.wood);
      // toilet: stalls and sinks; the vape scenario happens here
      B.stall(1.0, 8.6, 9.95); B.stall(2.0, 8.6, 9.95); for (const x of [.45, 1.5, 2.55]) rb(.38, .42, .5, M.white, x, .21, 9.55, .05);
      for (const x of [.6, 1.4]) B.sink(x, 7.9, PI);
      // lobby: guard desk, benches, trophy shelf
      B.counter(7.1, 8.4, 1.4, .6, PI / 2, M.cabinet, M.wood); chair(S, 7.65, 8.4, -PI / 2, M.fabric); H.seat(7.65, 8.4, -PI / 2, 'Охранник');
      B.bench(4.5, 9.6, 1.8); H.plant(3.4, 9.6, 1); B.sign('ШКОЛА-ЛИЦЕЙ №12', 5.5, 2.3, 9.888, PI, '#1d4ed8', 1.6);
      // canteen: tables and a frying line
      for (const x of [9.2, 10.8]) { rb(1.2, .04, .7, M.wood, x, .74, 8.6, .01); cyl(.03, .03, .72, M.darkMetal, x, .37, 8.6, S, 6); H.block(x - .6, 8.25, x + .6, 8.95); for (const s of [-1, 1]) B.bench(x, 8.6 + s * .55, 1.2); }
      B.counter(12.25, 8.75, 1.7, .55, PI / 2, M.metal, M.metal); B.fryer(13.55, 8.3, m.fryer, -PI / 2); B.stove(13.55, 9.2, -PI / 2); H.seat(12.85, 8.8, PI / 2, 'Повар', 'stand');
      rb(.35, .5, .35, m.bin, 10.3, .25, 7.35, .03); H.block(10.12, 7.17, 10.48, 7.53); // bin in the corridor (hazard 5)
      H.extinguisher(13.6, 7.75); H.extinguisher(.35, 7.75);
    },
    hazards(m) {
      return [
        { n: 1, cause: 'battery', name: 'Тележка зарядки ноутбуков', sub: 'перегрев аккумулятора → тление → огонь', zone: 'sch-it', pos: [9.6, .9, 5.5], glow: [m.cart],
          stages: [{ dur: 80, smoke: .005, heat: .05, co: 5, label: 'перегрев и тление' }, { smoke: .012, heat: .3, co: 22, fire: .9, label: 'горение' }] },
        { n: 2, cause: 'smoking', name: 'Вейп в туалете', sub: 'аэрозоль — ложная тревога, проверка на месте', zone: 'sch-wc', pos: [1.5, 1.4, 9.2], aerosol: true,
          stages: [{ dur: 45, smoke: .006, heat: 0, co: 0, label: 'пар от вейпа' }, { smoke: 0, heat: 0, co: 0, label: 'рассеялся', end: 1 }] },
        { n: 3, cause: 'cooking', name: 'Фритюрница в столовой', sub: 'перегрев масла → возгорание', zone: 'sch-food', pos: [13.55, 1.0, 8.3], glow: [m.fryer],
          stages: [{ dur: 50, smoke: .008, heat: .08, co: 3, label: 'масло дымит' }, { smoke: .013, heat: .35, co: 20, fire: 1, label: 'горение масла' }] },
        { n: 4, cause: 'electrical', name: 'Удлинитель у окна (часы)', sub: 'перегрузка зарядками ~2 ч → тление → огонь', zone: 'sch-cls', pos: [.3, .1, 4.4], glow: [m.strip], slow: true, fireY: .02,
          stages: [{ dur: 7200, ramp: 1, smoke: 4e-5, heat: .012, co: .05, label: 'скрытый перегрев' }, { dur: 90, smoke: .006, heat: .05, co: 6, label: 'тление' }, { smoke: .012, heat: .3, co: 24, fire: .7, label: 'горение' }] },
        { n: 5, cause: 'smoking', name: 'Урна в коридоре', sub: 'окурок/поджог → быстрое горение', zone: 'sch-cor', pos: [10.3, .5, 7.35], glow: [m.bin],
          stages: [{ dur: 25, smoke: .01, heat: .05, co: 8, label: 'тлеет мусор' }, { smoke: .012, heat: .25, co: 18, fire: .6, label: 'горение' }] },
      ];
    },
  },

  // ======================================================================= HOSPITAL
  hospital: {
    site_id: 'kzo-hospital-1', name: 'Городская больница №1 · терапия (демо)', short: 'Больница', kind: 'hospital',
    names: ['Пациент Б.', 'Пациентка С.', 'Пациент К.', 'Пациентка А.', 'Пациент Ж.', 'Пациентка Н.', 'Врач', 'Медсестра'],
    zones: [
      { id: 'hsp-w1', name: 'Палата 1', type: 'ward', x0: 0, z0: 0, x1: 4.6, z1: 5, floor: 'linoleum', tile: 1.5 },
      { id: 'hsp-w2', name: 'Палата 2', type: 'ward', x0: 4.6, z0: 0, x1: 9.2, z1: 5, floor: 'linoleum', tile: 1.5 },
      { id: 'hsp-proc', name: 'Процедурная', type: 'office', x0: 9.2, z0: 0, x1: 14, z1: 5, floor: 'kitTile', tile: 1.2 },
      { id: 'hsp-cor', name: 'Коридор', type: 'hall', x0: 0, z0: 5, x1: 14, z1: 6.8, floor: 'linoleum', tile: 1.5 },
      { id: 'hsp-w3', name: 'Палата 3', type: 'ward', x0: 0, z0: 6.8, x1: 5, z1: 10, floor: 'linoleum', tile: 1.5 },
      { id: 'hsp-post', name: 'Пост медсестры · выход', type: 'hall', x0: 5, z0: 6.8, x1: 9.5, z1: 10, floor: 'linoleum', tile: 1.5 },
      { id: 'hsp-sup', name: 'Подсобка · кислород', type: 'storage', x0: 9.5, z0: 6.8, x1: 14, z1: 10, floor: 'techTile', tile: 1.2 },
    ],
    walls: [
      W('x', 0, -.1, 14.1, .2, [win(.9, 3.6), win(5.5, 8.2), win(10.2, 12.9)]),
      W('x', 10, -.1, 14.1, .2, [exit(5.75, 6.75, -1), win(1.2, 3.8), win(11.0, 13.0)]),
      W('z', 0, .1, 9.9, .2, [win(1.0, 4.0), win(7.4, 9.4)]),
      W('z', 14, .1, 9.9, .2, [win(1.2, 3.8), exit(5.25, 6.55, 1)]),
      W('x', 5, .1, 13.9, .12, [door(2.6, 3.6), door(6.9, 7.9), door(11.2, 12.2)]),
      W('z', 4.6, .1, 4.94, .12), W('z', 9.2, .1, 4.94, .12),
      W('x', 6.8, .1, 13.9, .12, [door(3.2, 4.2, -1), arch(5.4, 9.1), door(11.0, 12.0, -1)]),
      W('z', 5, 6.86, 9.9, .12), W('z', 9.5, 6.86, 9.9, .12),
    ],
    adj: [['hsp-w1', 'hsp-cor'], ['hsp-w2', 'hsp-cor'], ['hsp-proc', 'hsp-cor'], ['hsp-cor', 'hsp-w3'], ['hsp-cor', 'hsp-post'], ['hsp-cor', 'hsp-sup']],
    sensors: [
      ['HSP-SMK-01', 'smoke', 2.3, CEIL, 2.6], ['HSP-SMK-02', 'smoke', 6.9, CEIL, 2.6], ['HSP-SMK-03', 'smoke', 11.6, CEIL, 2.0], ['HSP-HT-01', 'heat', 12.8, CEIL, 2.4],
      ['HSP-SMK-04', 'smoke', 3.2, CEIL, 5.9], ['HSP-SMK-05', 'smoke', 10.5, CEIL, 5.9],
      ['HSP-SMK-06', 'smoke', 2.5, CEIL, 8.0], ['HSP-MLT-01', 'multi', 2.5, CEIL, 9.2],
      ['HSP-SMK-07', 'smoke', 7.2, CEIL, 8.8], ['HSP-SMK-08', 'smoke', 11.8, CEIL, 8.4], ['HSP-HT-02', 'heat', 12.6, CEIL, 9.3],
      ['HSP-MCP-01', 'manual', 13.885, 1.5, 6.7, -Math.PI / 2], ['HSP-MCP-02', 'manual', 7.3, 1.5, 9.885, Math.PI], ['HSP-PNL-01', 'panel', 5.065, 1.5, 9.1, Math.PI / 2],
    ],
    sirens: [[2.3, 2.45, 4.935, Math.PI], [6.4, 2.45, 4.935, Math.PI], [10.4, 2.45, 4.935, Math.PI], [7.0, 2.45, 5.065, 0], [1.6, 2.45, 6.865, 0], [8.2, 2.45, 9.885, Math.PI], [12.6, 2.45, 9.885, Math.PI]],
    exitSigns: [[6.25, 9.885, Math.PI], [13.885, 5.9, -Math.PI / 2]],
    exits: [{ out: [6.25, 11.3], assembly: [2.9, 12.6] }, { out: [15.3, 5.9], assembly: [16.6, 3.2] }],
    build(H) {
      const B = kit(H), { M, rb, cyl, chair, S, PI, std } = H, m = this.mats = {
        o2: B.hz(0x2f6fd6, 0xff6a00), dryer: B.hz(0xd9dde2, 0xff5a00), strip: B.hz(0xf2f2f0), linen: B.hz(0xe8e4da, 0xff5a00),
      };
      const pt = (x, z, ry, sx, name, bl) => { B.bed(x, z, ry, bl, true); B.nightstand(x + (ry ? 0 : -.7), z + (ry ? -.7 : -.6)); H.seat(x + sx * .42, z + .25, sx > 0 ? PI / 2 : -PI / 2, name, 'sit', { slow: true }); };
      // wards 1 and 2: beds with heads at the north wall
      pt(1.25, 1.25, 0, 1, null, B.mats.blanketA); pt(3.45, 1.25, 0, -1, null, B.mats.blanketB);
      B.cylinder(.55, 2.75, m.o2, 1.3); B.ivStand(2.2, .9);
      pt(5.85, 1.25, 0, 1, null, B.mats.blanketC); pt(8.0, 1.25, 0, -1, null, B.mats.blanketA); B.ivStand(7.0, .9);
      // ward 3: heads at the south wall
      pt(1.3, 8.75, PI, 1, null, B.mats.blanketB); pt(3.6, 8.75, PI, -1, null, B.mats.blanketC);
      rb(.42, .045, .075, m.strip, 2.45, .025, 9.7, .012); // overloaded strip behind the beds (hazard 3)
      // procedure room
      H.ws(10.4, .85, PI, { w: 1.2, d: .6, scr: 2, cmat: M.fabricBlue }, 'Врач');
      rb(.6, 2.0, .45, B.mats.frameW, 13.6, 1.0, .5, .01); H.block(13.3, .25, 13.9, .75);
      B.counter(13.55, 2.6, 2.0, .6, PI / 2, B.mats.frameW, M.stone); rb(.45, .55, .45, m.dryer, 13.5, 1.18, 2.1, .02); B.sink(13.55, 3.5, -PI / 2);
      rb(.7, .55, 1.9, B.mats.frameW, 11.3, .3, 3.3, .03); rb(.7, .08, 1.9, B.mats.blanketC, 11.3, .6, 3.3, .03); H.block(10.95, 2.35, 11.65, 4.25);
      // nurse post
      B.counter(7.6, 7.75, 2.2, .55, 0, M.cabinet, M.wood, 1.05); chair(S, 7.6, 8.35, PI, M.fabricTeal); H.seat(7.6, 8.35, PI, 'Медсестра');
      B.shelf(9.0, 9.6, 0.8, .4, 1.8, 0, M.paper, 4); H.plant(5.4, 9.6, .9);
      B.sign('ОТДЕЛЕНИЕ ТЕРАПИИ', 7.2, 2.35, 6.866, 0, '#0e7490', 1.7);
      // supply room with oxygen cylinders and linen
      for (let i = 0; i < 5; i++) B.cylinder(10.0 + i * .28, 9.6, m.o2, 1.4); H.block(9.85, 9.4, 11.3, 9.85);
      B.shelf(13.5, 8.1, 1.2, .45, 1.9, -PI / 2, B.mats.mattress, 4); rb(.9, .6, .6, m.linen, 12.6, .3, 9.4, .04); H.block(12.15, 9.1, 13.05, 9.7);
      H.extinguisher(.35, 6.6); H.extinguisher(13.6, 6.6);
    },
    hazards(m) {
      return [
        { n: 1, cause: 'electrical', name: 'Искра у кислородной маски', sub: 'обогащённый O₂ — очень быстрое горение', zone: 'hsp-w1', pos: [1.0, .9, 2.6], glow: [m.o2],
          stages: [{ dur: 10, smoke: .004, heat: .12, co: 4, label: 'искра, вспышка' }, { smoke: .02, heat: .6, co: 30, fire: 1.2, label: 'горение в кислороде' }] },
        { n: 2, cause: 'electrical', name: 'Сухожаровой шкаф', sub: 'перегрев терморегулятора → тление', zone: 'hsp-proc', pos: [13.5, 1.2, 2.1], glow: [m.dryer],
          stages: [{ dur: 100, smoke: .004, heat: .08, co: 4, label: 'перегрев, запах гари' }, { smoke: .011, heat: .3, co: 20, fire: .7, label: 'горение' }] },
        { n: 3, cause: 'electrical', name: 'Удлинитель за кроватями (часы)', sub: 'медленный перегрев ~2 ч → тление → огонь', zone: 'hsp-w3', pos: [2.45, .1, 9.7], glow: [m.strip], slow: true, fireY: .02,
          stages: [{ dur: 7200, ramp: 1, smoke: 4e-5, heat: .012, co: .05, label: 'скрытый перегрев' }, { dur: 90, smoke: .006, heat: .05, co: 6, label: 'тление' }, { smoke: .012, heat: .3, co: 24, fire: .7, label: 'горение' }] },
        { n: 4, cause: 'smoking', name: 'Бельё в подсобке', sub: 'окурок в корзине с бельём → тление', zone: 'hsp-sup', pos: [12.6, .7, 9.4], glow: [m.linen],
          stages: [{ dur: 150, smoke: .005, heat: .02, co: 7, label: 'тление белья' }, { smoke: .012, heat: .3, co: 22, fire: .8, label: 'горение' }] },
      ];
    },
  },

  // ======================================================================= SHOPPING MALL
  mall: {
    site_id: 'kzo-mall-1', name: 'ТРЦ «Сырдария» · секция 1 этажа (демо)', short: 'ТРЦ', kind: 'mall',
    names: ['Гость 1', 'Гость 2', 'Гость 3', 'Гость 4', 'Гость 5', 'Гость 6', 'Покупатель', 'Покупательница', 'Кассир', 'Консультант', 'Повар'],
    zones: [
      { id: 'mal-food', name: 'Фудкорт', type: 'food', x0: 0, z0: 0, x1: 6, z1: 6, floor: 'marble', tile: 2 },
      { id: 'mal-cloth', name: 'Магазин одежды', type: 'shop', x0: 6, z0: 0, x1: 10, z1: 6, floor: 'parquet', tile: 2 },
      { id: 'mal-elec', name: 'Электроника', type: 'shop', x0: 10, z0: 0, x1: 14, z1: 6, floor: 'linoleum', tile: 1.5 },
      { id: 'mal-gal', name: 'Галерея', type: 'hall', x0: 0, z0: 6, x1: 14, z1: 7.6, floor: 'marble', tile: 2 },
      { id: 'mal-kit', name: 'Кухня фудкорта', type: 'kitchen', x0: 0, z0: 7.6, x1: 4, z1: 10, floor: 'kitTile', tile: 1.2 },
      { id: 'mal-ent', name: 'Вход · атриум', type: 'hall', x0: 4, z0: 7.6, x1: 10, z1: 10, floor: 'marble', tile: 2 },
      { id: 'mal-stor', name: 'Склад магазина', type: 'storage', x0: 10, z0: 7.6, x1: 14, z1: 10, floor: 'techTile', tile: 1.2 },
    ],
    walls: [
      W('x', 0, -.1, 14.1, .2, [exit(2.0, 3.0, 1), win(7.0, 9.0), win(11.0, 13.0)]),
      W('x', 10, -.1, 14.1, .2, [exit(5.75, 6.75, -1), win(7.1, 9.6, .3, 2.5), win(4.2, 5.4, .3, 2.5)]),
      W('z', 0, .1, 9.9, .2, [win(1.0, 5.0)]),
      W('z', 14, .1, 9.9, .2),
      W('x', 6, .1, 6.0, .12, [arch(.6, 5.4, 2.6)]),
      W('x', 6, 6.0, 13.9, .06, [door(7.6, 8.6), door(11.6, 12.6)], 'glass'),
      W('z', 6, .1, 5.97, .12), W('z', 10, .1, 5.97, .12),
      W('x', 7.6, .1, 13.9, .12, [door(1.5, 2.4, -1), arch(4.4, 9.6), door(11.0, 11.9, -1)]),
      W('z', 4, 7.66, 9.9, .12), W('z', 10, 7.66, 9.9, .12),
    ],
    adj: [['mal-food', 'mal-gal'], ['mal-cloth', 'mal-gal'], ['mal-elec', 'mal-gal'], ['mal-gal', 'mal-kit'], ['mal-gal', 'mal-ent'], ['mal-gal', 'mal-stor']],
    sensors: [
      ['MAL-SMK-01', 'smoke', 1.5, CEIL, 1.8], ['MAL-SMK-02', 'smoke', 4.5, CEIL, 4.2], ['MAL-MLT-01', 'multi', 3.0, CEIL, 3.0],
      ['MAL-SMK-03', 'smoke', 8.0, CEIL, 2.5], ['MAL-MLT-02', 'multi', 8.0, CEIL, 4.4],
      ['MAL-SMK-04', 'smoke', 12.0, CEIL, 2.0], ['MAL-MLT-03', 'multi', 12.0, CEIL, 4.0],
      ['MAL-SMK-05', 'smoke', 3.0, CEIL, 6.8], ['MAL-SMK-06', 'smoke', 11.0, CEIL, 6.8],
      ['MAL-SMK-07', 'smoke', 2.0, CEIL, 8.8], ['MAL-HT-01', 'heat', 1.0, CEIL, 9.0], ['MAL-CO-01', 'gas_co', .115, 1.55, 8.2, Math.PI / 2],
      ['MAL-SMK-08', 'smoke', 7.0, CEIL, 8.8], ['MAL-SMK-09', 'smoke', 12.0, CEIL, 8.8], ['MAL-HT-02', 'heat', 12.8, CEIL, 9.4],
      ['MAL-MCP-01', 'manual', 3.3, 1.5, .115, 0], ['MAL-MCP-02', 'manual', 7.3, 1.5, 9.885, Math.PI], ['MAL-PNL-01', 'panel', 9.935, 1.5, 9.0, -Math.PI / 2],
    ],
    sirens: [[4.5, 2.45, .115, 0], [8, 2.45, .115, 0], [12, 2.45, .115, 0], [7, 2.6, 7.535, Math.PI], [2.2, 2.45, 9.885, Math.PI], [8.2, 2.45, 9.885, Math.PI], [12, 2.45, 9.885, Math.PI]],
    exitSigns: [[6.25, 9.885, Math.PI], [2.5, .115, 0]],
    exits: [{ out: [6.25, 11.3], assembly: [2.9, 12.6] }, { out: [2.5, -1.4], assembly: [2.5, -3.3] }],
    build(H) {
      const B = kit(H), { M, rb, cyl, chair, S, PI, std } = H, m = this.mats = {
        fryer: B.hz(0x2b2b2b, 0xff7a00), neon: B.hz(0x1f2937, 0xff3a3a, { emissiveIntensity: 0 }), pb: B.hz(0x111827, 0xff5a00), lamp: B.hz(0xf5f5f0, 0xff7a00), card: B.hz(0xb08a5a, 0xff5a00),
      };
      // food court: 3 tables with guests, food stall counters
      let g = 0;
      for (const [x, z] of [[1.3, 1.6], [3.6, 1.6], [1.3, 3.9], [3.6, 3.9]]) {
        B.table(x, z, .42); for (const s of [-1, 1]) { const cz = z + s * .62; chair(S, x, cz, s > 0 ? PI : 0, M.fabricTeal); if (g < 6 && !(x === 3.6 && z === 3.9)) { H.seat(x, cz, s > 0 ? PI : 0, null); g++; } }
      }
      B.counter(5.55, 1.6, 2.2, .6, PI / 2, std({ color: 0xc2410c, roughness: .6 }), M.stone, 1.0); B.sign('ШАУРМА · ПЛОВ', 5.86, 2.2, 1.6, -PI / 2, '#c2410c', 1.4);
      B.counter(5.55, 4.4, 1.6, .6, PI / 2, std({ color: 0x15803d, roughness: .6 }), M.stone, 1.0); B.sign('КОФЕ', 5.86, 2.2, 4.4, -PI / 2, '#15803d', 1.0);
      // clothing store
      B.rack(7.3, 1.6, 1.3, PI / 2); B.rack(8.8, 1.6, 1.3, PI / 2); B.rack(8.0, 3.4, 1.4);
      B.shelf(8.0, .35, 2.2, .4, 1.9, 0, std({ color: 0x6b7280 }), 4);
      rb(2.0, .5, .05, m.neon, 8.0, 2.4, .13, .02); // illuminated sign on the back wall (hazard 2)
      B.counter(9.2, 4.9, 1.2, .55, PI / 2, M.walnut, M.wood, 1.0); H.seat(9.65, 4.9, -PI / 2, 'Кассир', 'stand');
      H.seat(7.3, 2.7, 0, 'Покупатель', 'stand'); H.seat(8.9, 2.6, PI, 'Покупательница', 'stand');
      // electronics store
      B.shelf(13.6, 2.6, 3.2, .45, 1.9, -PI / 2, std({ color: 0x1f2937 }), 4);
      rb(1.4, .85, .7, M.walnut, 11.5, .43, 3.0, .02); H.block(10.8, 2.65, 12.2, 3.35);
      for (let i = 0; i < 6; i++) rb(.08, .015, .16, M.blackGlass, 11.0 + i * .2, .87, 2.85, .004);
      rb(.5, .25, .3, m.pb, 11.6, .99, 3.2, .02); // power bank stand (hazard 3)
      B.counter(11.8, 5.2, 1.2, .5, 0, M.walnut, M.wood, 1.0); H.seat(11.8, 4.6, PI, 'Консультант', 'stand');
      // kitchen of the food court
      B.fryer(.5, 9.0, m.fryer, PI / 2); B.stove(.5, 8.15, PI / 2); B.counter(2.0, 9.6, 1.8, .55, 0, M.metal, M.metal); B.fridge(3.5, 9.55); H.seat(1.5, 8.6, -PI / 2, 'Повар', 'stand');
      // entrance
      B.bench(5.0, 9.4, 1.6); B.bench(8.8, 8.3, 1.4, PI / 2); H.plant(4.4, 9.6, 1.1, M.terracotta); H.plant(9.6, 9.6, 1.1, M.terracotta);
      B.sign('ТРЦ «СЫРДАРИЯ»', 6.25, 2.55, 9.888, PI, '#7c3aed', 1.6);
      // stockroom: shelving with cardboard, a work lamp
      B.shelf(11.0, 9.55, 1.6, .5, 2.0, 0, m.card, 4); B.shelf(13.55, 8.6, 1.6, .5, 2.0, -PI / 2, B.mats.card, 4);
      cyl(.02, .02, 1.6, M.darkMetal, 12.3, .8, 8.4, S, 6); rb(.25, .18, .2, m.lamp, 12.3, 1.65, 8.4, .03);
      H.extinguisher(.35, 6.6); H.extinguisher(13.6, 6.6);
    },
    hazards(m) {
      return [
        { n: 1, cause: 'cooking', name: 'Фритюр на кухне фудкорта', sub: 'перегрев масла → огонь под вытяжкой', zone: 'mal-kit', pos: [.5, 1.0, 9.0], glow: [m.fryer],
          stages: [{ dur: 45, smoke: .008, heat: .08, co: 3, label: 'масло дымит' }, { smoke: .014, heat: .38, co: 20, fire: 1, label: 'горение масла' }] },
        { n: 2, cause: 'electrical', name: 'Световая вывеска в магазине', sub: 'короткое замыкание драйвера → горение пластика', zone: 'mal-cloth', pos: [8.0, 2.4, .25], glow: [m.neon],
          stages: [{ dur: 40, smoke: .005, heat: .06, co: 4, label: 'искрение' }, { smoke: .012, heat: .28, co: 22, fire: .7, label: 'горение' }] },
        { n: 3, cause: 'battery', name: 'Повербанки на витрине (часы)', sub: 'деградация аккумулятора ~2 ч → тепловой разгон', zone: 'mal-elec', pos: [11.6, 1.0, 3.2], glow: [m.pb], slow: true,
          stages: [{ dur: 7200, ramp: 1, smoke: 2e-5, heat: .012, co: .015, label: 'нагрев аккумулятора' }, { dur: 50, smoke: .004, heat: .3, co: 3, label: 'тепловой разгон' }, { smoke: .012, heat: .4, co: 22, fire: .8, label: 'горение' }] },
        { n: 4, cause: 'electrical', name: 'Картон у лампы на складе', sub: 'тление коробок → горение стеллажа', zone: 'mal-stor', pos: [12.3, 1.2, 8.6], glow: [m.lamp, m.card],
          stages: [{ dur: 120, smoke: .005, heat: .03, co: 6, label: 'тление картона' }, { smoke: .014, heat: .32, co: 24, fire: .9, label: 'горение стеллажа' }] },
      ];
    },
  },

  // ======================================================================= DORMITORY
  dorm: {
    site_id: 'kzo-dorm-3', name: 'Общежитие №3 · 1 этаж (демо)', short: 'Общежитие', kind: 'residential',
    names: ['Ерлан', 'Мирас', 'Асель', 'Камила', 'Диас', 'Аяулым', 'Студент', 'Вахтёр'],
    zones: [
      { id: 'drm-r1', name: 'Комната 101', type: 'room', x0: 0, z0: 0, x1: 4.6, z1: 5, floor: 'parquet', tile: 2 },
      { id: 'drm-r2', name: 'Комната 102', type: 'room', x0: 4.6, z0: 0, x1: 9.3, z1: 5, floor: 'parquet', tile: 2 },
      { id: 'drm-r3', name: 'Комната 103', type: 'room', x0: 9.3, z0: 0, x1: 14, z1: 5, floor: 'parquet', tile: 2 },
      { id: 'drm-cor', name: 'Коридор', type: 'hall', x0: 0, z0: 5, x1: 14, z1: 6.6, floor: 'linoleum', tile: 1.5 },
      { id: 'drm-kit', name: 'Общая кухня', type: 'kitchen', x0: 0, z0: 6.6, x1: 5, z1: 10, floor: 'kitTile', tile: 1.2 },
      { id: 'drm-hall', name: 'Холл · вахта', type: 'hall', x0: 5, z0: 6.6, x1: 9.5, z1: 10, floor: 'linoleum', tile: 1.5 },
      { id: 'drm-laun', name: 'Прачечная', type: 'laundry', x0: 9.5, z0: 6.6, x1: 14, z1: 10, floor: 'kitTile', tile: 1.2 },
    ],
    walls: [
      W('x', 0, -.1, 14.1, .2, [win(1.2, 3.4), win(5.8, 8.0), win(10.5, 12.7)]),
      W('x', 10, -.1, 14.1, .2, [exit(5.75, 6.75, -1), win(1.2, 3.6), win(11.0, 13.0)]),
      W('z', 0, .1, 9.9, .2, [win(1.5, 3.5), win(7.4, 9.2)]),
      W('z', 14, .1, 9.9, .2, [win(1.5, 3.5), exit(5.15, 6.45, 1)]),
      W('x', 5, .1, 13.9, .12, [door(3.4, 4.3), door(7.9, 8.8), door(12.4, 13.3)]),
      W('z', 4.6, .1, 4.94, .12), W('z', 9.3, .1, 4.94, .12),
      W('x', 6.6, .1, 13.9, .12, [door(2.0, 3.0, -1), arch(5.4, 9.1), door(11.0, 11.9, -1)]),
      W('z', 5, 6.66, 9.9, .12), W('z', 9.5, 6.66, 9.9, .12),
    ],
    adj: [['drm-r1', 'drm-cor'], ['drm-r2', 'drm-cor'], ['drm-r3', 'drm-cor'], ['drm-cor', 'drm-kit'], ['drm-cor', 'drm-hall'], ['drm-cor', 'drm-laun']],
    sensors: [
      ['DRM-SMK-01', 'smoke', 2.3, CEIL, 2.8], ['DRM-MLT-01', 'multi', 2.3, CEIL, 1.4],
      ['DRM-SMK-02', 'smoke', 7.0, CEIL, 2.8], ['DRM-MLT-02', 'multi', 7.0, CEIL, 1.4],
      ['DRM-SMK-03', 'smoke', 11.6, CEIL, 2.5],
      ['DRM-SMK-04', 'smoke', 3.0, CEIL, 5.8], ['DRM-SMK-05', 'smoke', 11.0, CEIL, 5.8],
      ['DRM-SMK-06', 'smoke', 2.5, CEIL, 8.0], ['DRM-HT-01', 'heat', 1.5, CEIL, 9.2],
      ['DRM-SMK-07', 'smoke', 7.2, CEIL, 8.4], ['DRM-SMK-08', 'smoke', 11.8, CEIL, 8.4], ['DRM-HT-02', 'heat', 13.0, CEIL, 7.6],
      ['DRM-MCP-01', 'manual', 13.885, 1.5, 6.55, -Math.PI / 2], ['DRM-MCP-02', 'manual', 7.3, 1.5, 9.885, Math.PI], ['DRM-PNL-01', 'panel', 9.435, 1.5, 9.1, -Math.PI / 2],
    ],
    sirens: [[1.4, 2.45, 4.935, Math.PI], [6.0, 2.45, 4.935, Math.PI], [10.6, 2.45, 4.935, Math.PI], [7, 2.45, 5.065, 0], [1, 2.45, 6.665, 0], [8.2, 2.45, 9.885, Math.PI], [12.6, 2.45, 9.885, Math.PI]],
    exitSigns: [[6.25, 9.885, Math.PI], [13.885, 5.8, -Math.PI / 2]],
    exits: [{ out: [6.25, 11.3], assembly: [2.9, 12.6] }, { out: [15.3, 5.8], assembly: [16.6, 3.2] }],
    build(H) {
      const B = kit(H), { M, rb, cyl, chair, S, PI, std } = H, m = this.mats = {
        heater: B.hz(0xe9e6df, 0xff5a00), scooter: B.hz(0x111827, 0xff5a00), cig: B.hz(0xc9b38d, 0xff6a00), pan: B.hz(0x1f2937, 0xff7a00), dryer: B.hz(0xf2f2f0, 0xff5a00),
      };
      const room = (x0, people, bl) => {
        B.bed(x0 + .55, 1.3, 0, bl[0]); B.bed(x0 + 4.0, 1.3, 0, bl[1]);
        B.wardrobe(x0 + 1.0, 4.62, 1.0, PI);
        H.ws(x0 + 2.3, .8, PI, { w: 1.1, d: .55, scr: 0, cmat: M.fabric, pc: false }, null, !!people.desk);
        if (people.bedA) H.seat(x0 + .95, 1.6, PI / 2, null); if (people.bedB) H.seat(x0 + 3.6, 1.6, -PI / 2, null);
        B.nightstand(x0 + 1.2, .35); rb(.5, .85, .5, M.white, x0 + 3.95, .43, 3.0, .03); H.block(x0 + 3.7, 2.75, x0 + 4.2, 3.25); // small fridge
      };
      room(0, { desk: true, bedA: true }, [B.mats.blanketA, B.mats.blanketB]);
      room(4.65, { bedA: true, bedB: true }, [B.mats.blanketC, B.mats.blanketA]);
      room(9.35, { bedA: true }, [B.mats.blanketB, B.mats.blanketC]);
      rb(.45, .6, .18, m.heater, 3.0, .32, .3, .02); // oil heater in 101 (hazard 5)
      // e-scooter charging in 102 (hazard 1)
      { const g = B.grp(6.2, 4.3, PI / 2); rb(1.1, .06, .16, m.scooter, 0, .12, 0, .02, g); cyl(.1, .1, .05, M.rubber, -.5, .1, 0, g, 12).rotation.x = PI / 2; cyl(.1, .1, .05, M.rubber, .5, .1, 0, g, 12).rotation.x = PI / 2; cyl(.02, .02, 1.0, M.darkMetal, -.45, .6, 0, g, 6); rb(.4, .03, .03, M.black, -.45, 1.1, 0, .01, g); H.block(6.0, 3.7, 6.4, 4.9); }
      rb(.15, .08, .15, m.cig, 9.85, .58, 1.6, .02); // ash tray & cigarette on the bed in 103 (hazard 3)
      // shared kitchen
      for (const x of [1.0, 1.8, 2.6]) B.stove(x, 9.6); rb(.3, .05, .3, m.pan, 1.0, .9, 9.55, .03);
      B.fridge(3.6, 9.55); B.table(2.6, 7.8, .5); B.stool(2.0, 7.8); B.stool(3.2, 7.8); H.seat(3.2, 7.8, -PI / 2, 'Студент');
      // hall with the duty desk
      B.counter(8.6, 8.2, 1.4, .6, PI / 2, M.walnut, M.wood, 1.0); chair(S, 9.1, 8.2, -PI / 2, M.fabric); H.seat(9.1, 8.2, -PI / 2, 'Вахтёр');
      H.sofa(5.8, 9.4, PI, M.fabricBlue); H.block(5.1, 9.0, 6.5, 9.85); B.sign('ОБЩЕЖИТИЕ №3', 7.6, 2.3, 9.888, PI, '#b45309', 1.4);
      // laundry
      for (const z of [7.3, 8.0, 8.7]) B.washer(13.55, z, -PI / 2); rb(.6, .85, .6, m.dryer, 13.55, .43, 9.45, .03); H.block(13.25, 9.15, 13.85, 9.75);
      rb(.6, .5, .4, std({ color: 0x60a5fa }), 10.3, .25, 9.6, .05);
      H.extinguisher(.35, 6.4); H.extinguisher(13.6, 6.4);
    },
    hazards(m) {
      return [
        { n: 1, cause: 'battery', name: 'Зарядка электросамоката (часы)', sub: 'деградация батареи ~1,5 ч → тепловой разгон → огонь', zone: 'drm-r2', pos: [6.2, .3, 4.3], glow: [m.scooter], slow: true, fireY: .05,
          stages: [{ dur: 5400, ramp: 1, smoke: 2e-5, heat: .014, co: .02, label: 'нагрев батареи на зарядке' }, { dur: 40, smoke: .006, heat: .4, co: 5, label: 'тепловой разгон' }, { smoke: .016, heat: .45, co: 26, fire: 1.1, label: 'горение' }] },
        { n: 2, cause: 'cooking', name: 'Забытая сковорода', sub: 'масло на плите без присмотра → огонь', zone: 'drm-kit', pos: [1.0, 1.0, 9.55], glow: [m.pan],
          stages: [{ dur: 70, smoke: .007, heat: .07, co: 4, label: 'масло дымит' }, { smoke: .013, heat: .33, co: 20, fire: .9, label: 'горение' }] },
        { n: 3, cause: 'smoking', name: 'Сигарета на кровати', sub: 'тление матраса — много CO, мало дыма', zone: 'drm-r3', pos: [9.85, .6, 1.6], glow: [m.cig],
          stages: [{ dur: 200, smoke: .003, heat: .015, co: 12, label: 'тление матраса' }, { smoke: .013, heat: .3, co: 30, fire: .8, label: 'горение' }] },
        { n: 4, cause: 'electrical', name: 'Сушильная машина', sub: 'пух в фильтре → перегрев → огонь', zone: 'drm-laun', pos: [13.55, .9, 9.45], glow: [m.dryer],
          stages: [{ dur: 90, smoke: .004, heat: .06, co: 4, label: 'перегрев, запах гари' }, { smoke: .012, heat: .3, co: 20, fire: .8, label: 'горение' }] },
        { n: 5, cause: 'heater', name: 'Масляный обогреватель (часы)', sub: 'перегрев розетки ~2,5 ч → тление', zone: 'drm-r1', pos: [3.0, .35, .3], glow: [m.heater], slow: true,
          stages: [{ dur: 9000, ramp: 1, smoke: 5e-5, heat: .012, co: .06, label: 'скрытый перегрев' }, { dur: 120, smoke: .006, heat: .05, co: 6, label: 'тление' }, { smoke: .012, heat: .3, co: 24, fire: .7, label: 'горение' }] },
      ];
    },
  },
};
export const SCENE_LIST = [['office', 'Офис IT-компании'], ['school', 'Школа'], ['hospital', 'Больница'], ['mall', 'ТРЦ'], ['dorm', 'Общежитие']];
