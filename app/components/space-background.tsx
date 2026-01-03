"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type Planet = {
	pivot: THREE.Object3D;
	mesh: THREE.Mesh;
	orbitSpeed: number;
	rotationSpeed: number;
};

export function SpaceBackground() {
	const containerRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const renderer = new THREE.WebGLRenderer({
			antialias: true,
			alpha: false,
			powerPreference: "high-performance",
		});
		renderer.setClearColor(0x030014, 1);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.0;
		renderer.domElement.style.width = "100%";
		renderer.domElement.style.height = "100%";
		renderer.domElement.style.display = "block";
		container.appendChild(renderer.domElement);

		const scene = new THREE.Scene();
		scene.fog = new THREE.FogExp2(0x030014, 0.012);

		const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
		camera.position.set(0, 0, 45);

		const ambient = new THREE.AmbientLight(0xffffff, 0.6);
		scene.add(ambient);
		const key = new THREE.PointLight(0x88ccff, 1.2, 200);
		key.position.set(20, 10, 40);
		scene.add(key);
		const sun = new THREE.DirectionalLight(0xfff0d6, 1.0);
		sun.position.set(-30, 10, 25);
		scene.add(sun);

		// Distant starfield (more realistic: round sprite, varied colors/sizes, subtle twinkle)
		const starCount = 5200;
		const starsGeometry = new THREE.BufferGeometry();
		const starsPositions = new Float32Array(starCount * 3);
		const starsColors = new Float32Array(starCount * 3);
		const starsSizes = new Float32Array(starCount);
		const starsTwinkle = new Float32Array(starCount);

		const starColor = (t: number) => {
			// Weighted: mostly white/yellow, some blue, a few orange/red
			if (t < 0.68) return new THREE.Color(0xffffff);
			if (t < 0.86) return new THREE.Color(0xfff1d6); // warm white
			if (t < 0.95) return new THREE.Color(0xcfe7ff); // cool blue
			return new THREE.Color(0xffd1a6); // orange
		};

		for (let i = 0; i < starCount; i++) {
			const i3 = i * 3;

			// Put stars on a large sphere, with slightly higher density near the galaxy plane
			const r = 260 + Math.random() * 140;
			const theta = Math.random() * Math.PI * 2;
			let y = (Math.random() * 2 - 1) * r;
			// bias: keep more points near y=0
			y *= 0.6 + 0.4 * Math.random();
			const xz = Math.sqrt(Math.max(0, r * r - y * y));
			const x = Math.cos(theta) * xz;
			const z = Math.sin(theta) * xz;

			starsPositions[i3] = x;
			starsPositions[i3 + 1] = y;
			starsPositions[i3 + 2] = z;

			const c = starColor(Math.random());
			// tiny random tint variation
			c.offsetHSL((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.06);
			starsColors[i3] = c.r;
			starsColors[i3 + 1] = c.g;
			starsColors[i3 + 2] = c.b;

			// size + brightness: many small, few large
			const size = 0.8 + (Math.random() ** 3) * 3.2;
			starsSizes[i] = size;
			starsTwinkle[i] = Math.random() * Math.PI * 2;
		}

		starsGeometry.setAttribute(
			"position",
			new THREE.BufferAttribute(starsPositions, 3),
		);
		starsGeometry.setAttribute(
			"color",
			new THREE.BufferAttribute(starsColors, 3),
		);
		starsGeometry.setAttribute(
			"aSize",
			new THREE.BufferAttribute(starsSizes, 1),
		);
		starsGeometry.setAttribute(
			"aTwinkle",
			new THREE.BufferAttribute(starsTwinkle, 1),
		);

		const starsMaterial = new THREE.ShaderMaterial({
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			uniforms: {
				uTime: { value: 0 },
				uPixelRatio: { value: renderer.getPixelRatio() },
			},
			vertexShader: `
				attribute float aSize;
				attribute float aTwinkle;
				varying vec3 vColor;
				varying float vTwinkle;
				uniform float uPixelRatio;
				uniform float uTime;

				void main() {
					vColor = color;
					vTwinkle = aTwinkle;
					vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
					float dist = max(1.0, -mvPosition.z);
					// Perspective sizing, clamped for stability
					float size = aSize * uPixelRatio * (90.0 / dist);
					gl_PointSize = clamp(size, 1.0, 6.0);
					gl_Position = projectionMatrix * mvPosition;
				}
			`,
			fragmentShader: `
				varying vec3 vColor;
				varying float vTwinkle;
				uniform float uTime;

				void main() {
					vec2 uv = gl_PointCoord - vec2(0.5);
					float d = length(uv);
					// soft circular falloff
					float core = smoothstep(0.50, 0.10, d);
					float halo = smoothstep(0.50, 0.00, d) * 0.35;

					float tw = 0.88 + 0.12 * sin(uTime * 1.4 + vTwinkle);
					float alpha = (core + halo) * tw;
					if (alpha < 0.02) discard;

					gl_FragColor = vec4(vColor, alpha);
				}
			`,
			vertexColors: true,
		});

		const stars = new THREE.Points(starsGeometry, starsMaterial);
		scene.add(stars);

		// Spiral galaxy (swirl)
		const galaxy = new THREE.Group();
		scene.add(galaxy);

		const galaxyCount = 12000;
		const galaxyGeometry = new THREE.BufferGeometry();
		const galaxyPositions = new Float32Array(galaxyCount * 3);
		const galaxyColors = new Float32Array(galaxyCount * 3);
		const innerColor = new THREE.Color("#b388ff");
		const outerColor = new THREE.Color("#00d9ff");
		for (let i = 0; i < galaxyCount; i++) {
			const i3 = i * 3;
			const radius = Math.random() ** 0.55 * 50;
			const branch = i % 4;
			const branchAngle = (branch / 4) * Math.PI * 2;
			const spinAngle = radius * 0.35;
			const randomX = (Math.random() - 0.5) * 0.9 * (1 - radius / 55);
			const randomY = (Math.random() - 0.5) * 0.4 * (1 - radius / 55);
			const randomZ = (Math.random() - 0.5) * 0.9 * (1 - radius / 55);
			const angle = branchAngle + spinAngle;

			galaxyPositions[i3] = Math.cos(angle) * radius + randomX;
			galaxyPositions[i3 + 1] = randomY * 8;
			galaxyPositions[i3 + 2] = Math.sin(angle) * radius + randomZ;

			const mixed = innerColor.clone().lerp(outerColor, radius / 55);
			galaxyColors[i3] = mixed.r;
			galaxyColors[i3 + 1] = mixed.g;
			galaxyColors[i3 + 2] = mixed.b;
		}
		galaxyGeometry.setAttribute(
			"position",
			new THREE.BufferAttribute(galaxyPositions, 3),
		);
		galaxyGeometry.setAttribute(
			"color",
			new THREE.BufferAttribute(galaxyColors, 3),
		);
		const galaxyMaterial = new THREE.PointsMaterial({
			size: 0.08,
			sizeAttenuation: true,
			vertexColors: true,
			transparent: true,
			opacity: 0.95,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		});
		const galaxyPoints = new THREE.Points(galaxyGeometry, galaxyMaterial);
		galaxy.add(galaxyPoints);

		// Planet textures (public/ -> served from /textures/*)
		const texLoader = new THREE.TextureLoader();
		const earthMap = texLoader.load("/textures/earth.png");
		earthMap.colorSpace = THREE.SRGBColorSpace;
		const marsMap = texLoader.load("/textures/mars.jpg");
		marsMap.colorSpace = THREE.SRGBColorSpace;
		const jupiterMap = texLoader.load("/textures/jupiter.jpg");
		jupiterMap.colorSpace = THREE.SRGBColorSpace;
		const mercuryMap = texLoader.load("/textures/mercury.jpg");
		mercuryMap.colorSpace = THREE.SRGBColorSpace;
		const venusMap = texLoader.load("/textures/venus.jpg");
		venusMap.colorSpace = THREE.SRGBColorSpace;
		const saturnMap = texLoader.load("/textures/saturn.jpg");
		saturnMap.colorSpace = THREE.SRGBColorSpace;
		const uranusMap = texLoader.load("/textures/uranus.jpg");
		uranusMap.colorSpace = THREE.SRGBColorSpace;
		const neptuneMap = texLoader.load("/textures/neptune.jpg");
		neptuneMap.colorSpace = THREE.SRGBColorSpace;

		const createPlanet = (
			radius: number,
			map: THREE.Texture,
			orbitRadius: number,
			orbitSpeed: number,
			rotationSpeed: number,
			materialTuning?: Partial<
				Pick<
					THREE.MeshStandardMaterialParameters,
					"roughness" | "metalness" | "emissive" | "emissiveIntensity"
				>
			>,
		): Planet => {
			const pivot = new THREE.Object3D();
			const geometry = new THREE.SphereGeometry(radius, 48, 48);
			const materialParams: THREE.MeshStandardMaterialParameters = {
				map,
				roughness: materialTuning?.roughness ?? 0.9,
				metalness: materialTuning?.metalness ?? 0.0,
			};
			if (materialTuning?.emissive !== undefined) {
				materialParams.emissive = materialTuning.emissive;
			}
			if (materialTuning?.emissiveIntensity !== undefined) {
				materialParams.emissiveIntensity = materialTuning.emissiveIntensity;
			}
			const material = new THREE.MeshStandardMaterial(materialParams);
			const mesh = new THREE.Mesh(geometry, material);
			mesh.position.x = orbitRadius;
			pivot.add(mesh);
			galaxy.add(pivot);
			return { pivot, mesh, orbitSpeed, rotationSpeed };
		};

		// 8 planets (Mercury → Neptune)
		const planets: Planet[] = [
			createPlanet(0.7, mercuryMap, 7, 0.42, 0.45, {
				roughness: 0.98,
				metalness: 0.0,
			}),
			createPlanet(1.05, venusMap, 9, 0.32, 0.12, {
				roughness: 0.96,
				metalness: 0.0,
			}),
			createPlanet(1.4, earthMap, 11.5, 0.26, 0.35, {
				roughness: 0.9,
				metalness: 0.0,
			}),
			createPlanet(1.15, marsMap, 14, 0.21, 0.22, {
				roughness: 0.95,
				metalness: 0.0,
			}),
			createPlanet(2.6, jupiterMap, 20, 0.14, 0.12, {
				roughness: 0.92,
				metalness: 0.0,
			}),
			createPlanet(2.2, saturnMap, 26, 0.11, 0.11, {
				roughness: 0.93,
				metalness: 0.0,
			}),
			createPlanet(1.8, uranusMap, 31, 0.085, 0.08, {
				roughness: 0.94,
				metalness: 0.0,
			}),
			createPlanet(1.9, neptuneMap, 36, 0.07, 0.09, {
				roughness: 0.94,
				metalness: 0.0,
			}),
		];
		// Approx. axial tilts (radians)
		planets[0]?.mesh.rotateZ(THREE.MathUtils.degToRad(0.03)); // Mercury
		planets[1]?.mesh.rotateZ(THREE.MathUtils.degToRad(177.4)); // Venus (retrograde-ish)
		planets[2]?.mesh.rotateZ(THREE.MathUtils.degToRad(23.5)); // Earth
		planets[3]?.mesh.rotateZ(THREE.MathUtils.degToRad(25.2)); // Mars
		planets[4]?.mesh.rotateZ(THREE.MathUtils.degToRad(3.1)); // Jupiter
		planets[5]?.mesh.rotateZ(THREE.MathUtils.degToRad(26.7)); // Saturn
		planets[6]?.mesh.rotateZ(THREE.MathUtils.degToRad(97.8)); // Uranus
		planets[7]?.mesh.rotateZ(THREE.MathUtils.degToRad(28.3)); // Neptune

		// Saturn ring (procedural-ish, no external asset)
		const saturnPivot = planets[5]?.pivot;
		const saturnMesh = planets[5]?.mesh;
		let saturnRing: THREE.Mesh | undefined;
		if (saturnPivot && saturnMesh) {
			const ringCanvas = document.createElement("canvas");
			ringCanvas.width = 512;
			ringCanvas.height = 64;
			const ctx = ringCanvas.getContext("2d");
			if (ctx) {
				const g = ctx.createLinearGradient(0, 0, ringCanvas.width, 0);
				// subtle banding similar to Saturn rings
				g.addColorStop(0.0, "rgba(255,255,255,0)");
				g.addColorStop(0.08, "rgba(240,220,190,0.10)");
				g.addColorStop(0.18, "rgba(255,245,220,0.22)");
				g.addColorStop(0.35, "rgba(220,200,170,0.18)");
				g.addColorStop(0.55, "rgba(255,245,220,0.25)");
				g.addColorStop(0.72, "rgba(210,190,160,0.16)");
				g.addColorStop(0.9, "rgba(255,245,220,0.10)");
				g.addColorStop(1.0, "rgba(255,255,255,0)");
				ctx.fillStyle = g;
				ctx.fillRect(0, 0, ringCanvas.width, ringCanvas.height);

				// add thin gaps
				ctx.globalCompositeOperation = "destination-out";
				ctx.fillStyle = "rgba(0,0,0,0.35)";
				for (let x = 40; x < ringCanvas.width; x += 70) {
					ctx.fillRect(x, 0, 2, ringCanvas.height);
				}
				ctx.globalCompositeOperation = "source-over";
			}
			const ringTex = new THREE.CanvasTexture(ringCanvas);
			ringTex.colorSpace = THREE.SRGBColorSpace;
			const ringGeo = new THREE.RingGeometry(2.8, 4.6, 96, 2);
			const ringMat = new THREE.MeshBasicMaterial({
				map: ringTex,
				transparent: true,
				opacity: 0.75,
				side: THREE.DoubleSide,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
			});
			saturnRing = new THREE.Mesh(ringGeo, ringMat);
			saturnRing.rotation.x = THREE.MathUtils.degToRad(74); // tilt a bit
			saturnRing.position.copy(saturnMesh.position);
			saturnPivot.add(saturnRing);
		}

		// Simple atmosphere glow for Earth
		const earth = planets[0]?.mesh;
		let atmosphere: THREE.Mesh | undefined;
		if (earth) {
			const atmoGeo = new THREE.SphereGeometry(1.4 * 1.05, 48, 48);
			const atmoMat = new THREE.MeshBasicMaterial({
				color: 0x66b3ff,
				transparent: true,
				opacity: 0.08,
				blending: THREE.AdditiveBlending,
				depthWrite: false,
			});
			atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
			atmosphere.position.copy(earth.position);
			planets[0]?.pivot.add(atmosphere);
		}

		const resize = () => {
			const width = Math.max(1, container.clientWidth);
			const height = Math.max(1, container.clientHeight);
			renderer.setSize(width, height, false);
			starsMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
		};

		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(container);

		const clock = new THREE.Clock();
		let rafId = 0;
		const animate = () => {
			rafId = window.requestAnimationFrame(animate);
			const t = clock.getElapsedTime();

			starsMaterial.uniforms.uTime.value = t;
			galaxy.rotation.y = t * 0.08;
			galaxy.rotation.z = t * 0.03;
			stars.rotation.y = t * 0.01;

			for (const p of planets) {
				p.pivot.rotation.y = t * p.orbitSpeed;
				p.mesh.rotation.y = t * p.rotationSpeed;
			}

			renderer.render(scene, camera);
		};
		animate();

		return () => {
			window.cancelAnimationFrame(rafId);
			ro.disconnect();

			for (const p of planets) {
				p.mesh.geometry.dispose();
				(p.mesh.material as THREE.Material).dispose();
			}
			if (saturnRing) {
				saturnRing.geometry.dispose();
				(saturnRing.material as THREE.Material).dispose();
				const tex = (saturnRing.material as THREE.MeshBasicMaterial).map;
				tex?.dispose();
			}
			if (atmosphere) {
				atmosphere.geometry.dispose();
				(atmosphere.material as THREE.Material).dispose();
			}

			starsGeometry.dispose();
			starsMaterial.dispose();
			galaxyGeometry.dispose();
			galaxyMaterial.dispose();
			earthMap.dispose();
			marsMap.dispose();
			jupiterMap.dispose();
			mercuryMap.dispose();
			venusMap.dispose();
			saturnMap.dispose();
			uranusMap.dispose();
			neptuneMap.dispose();
			renderer.dispose();

			// Remove canvas
			if (renderer.domElement.parentElement === container) {
				container.removeChild(renderer.domElement);
			}
		};
	}, []);

	return (
		<div
			ref={containerRef}
			className="pointer-events-none absolute inset-0 z-0"
			aria-hidden="true"
		/>
	);
}
