import * as THREE from 'three';

/** Neon arena around the table: glowing floor, tiered stands with a crowd, neon rings and light rigs. */
export function buildArena(): THREE.Group {
  const root = new THREE.Group();

  // Sky dome: deep purple fading to navy, so the background isn't flat.
  const sky = document.createElement('canvas');
  sky.width = 4;
  sky.height = 256;
  const sg = sky.getContext('2d')!;
  const grad = sg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#05030f');
  grad.addColorStop(0.55, '#1a0b3a');
  grad.addColorStop(1, '#3a1460');
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(sky);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  root.add(new THREE.Mesh(new THREE.SphereGeometry(22, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })));

  // Floor: dark glossy court with neon rings and a starburst under the table.
  const fc = document.createElement('canvas');
  fc.width = fc.height = 1024;
  const g = fc.getContext('2d')!;
  const bg = g.createRadialGradient(512, 512, 40, 512, 512, 520);
  bg.addColorStop(0, '#2a1650');
  bg.addColorStop(0.6, '#120c2a');
  bg.addColorStop(1, '#070611');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 1024);
  g.globalAlpha = 0.18;
  for (let i = 0; i < 24; i++) {
    g.fillStyle = i % 2 ? '#ff4fd8' : '#4fb6ff';
    g.beginPath();
    g.moveTo(512, 512);
    g.arc(512, 512, 520, (i / 24) * Math.PI * 2, ((i + 1) / 24) * Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.lineWidth = 6;
  for (const [r, c] of [[210, '#d8f24a'], [300, '#ff4fd8'], [390, '#4fb6ff']] as const) {
    g.strokeStyle = c;
    g.shadowColor = c;
    g.shadowBlur = 24;
    g.beginPath();
    g.arc(512, 512, r, 0, Math.PI * 2);
    g.stroke();
  }
  const floorTex = new THREE.CanvasTexture(fc);
  floorTex.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(10, 64),
    new THREE.MeshPhysicalMaterial({ map: floorTex, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15, emissive: 0xffffff, emissiveMap: floorTex, emissiveIntensity: 0.35 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  // Tiered stands in a ring, with an instanced crowd in bright shirts.
  const tiers = 6;
  const step = new THREE.MeshStandardMaterial({ color: 0x1a1433, roughness: 0.7 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff4fd8, emissiveIntensity: 1.5 });
  const shirts = [0xff4f6e, 0xd8f24a, 0x4fb6ff, 0xff9f1c, 0xb06bff, 0x2ee6a6, 0xffffff];
  const seatsPer = 90;
  const crowd = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.08, 0.16, 3, 8), new THREE.MeshStandardMaterial({ roughness: 0.6 }), tiers * seatsPer);
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  let n = 0;
  for (let t = 0; t < tiers; t++) {
    const r0 = 5.4 + t * 0.55;
    const h = 0.35 + t * 0.38;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r0 + 0.55, r0 + 0.55, h, 64, 1, true), step);
    ring.position.y = h / 2;
    root.add(ring);
    const top = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + 0.55, 64), step);
    top.rotation.x = -Math.PI / 2;
    top.position.y = h;
    root.add(top);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(r0, 0.012, 6, 96), trim);
    edge.rotation.x = Math.PI / 2;
    edge.position.y = h + 0.01;
    root.add(edge);
    for (let i = 0; i < seatsPer; i++) {
      if (Math.random() < 0.15) continue; // a few empty seats
      const a = ((i + (t % 2) * 0.5) / seatsPer) * Math.PI * 2;
      const r = r0 + 0.3;
      m.makeRotationY(-a);
      m.setPosition(Math.cos(a) * r, h + 0.17 + Math.random() * 0.05, Math.sin(a) * r);
      crowd.setMatrixAt(n, m);
      crowd.setColorAt(n, col.set(shirts[(Math.random() * shirts.length) | 0]));
      n++;
    }
  }
  crowd.count = n;
  root.add(crowd);

  // Floating neon rings and four light rigs aimed at the table.
  const neon = (color: number, r: number, y: number) => {
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 8, 120), new THREE.MeshBasicMaterial({ color, fog: false }));
    t.rotation.x = Math.PI / 2;
    t.position.y = y;
    root.add(t);
  };
  neon(0xff4fd8, 3.2, 3.6);
  neon(0x4fb6ff, 2.6, 3.9);
  neon(0xd8f24a, 2.0, 4.2);
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2f40, metalness: 0.8, roughness: 0.4 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 4, 10), metal);
    pole.position.set(Math.cos(a) * 4.6, 2, Math.sin(a) * 3.6);
    root.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.2), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
    lamp.position.set(Math.cos(a) * 4.6, 4.05, Math.sin(a) * 4.6);
    lamp.lookAt(0, 0.8, 0);
    root.add(lamp);
    const c = [0xff4fd8, 0x4fb6ff][i % 2];
    const light = new THREE.PointLight(c, 8, 9);
    light.position.set(Math.cos(a) * 3, 2.6, Math.sin(a) * 3);
    root.add(light);
  }
  return root;
}
