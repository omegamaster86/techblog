"use client";

import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

const PARTICLE_COUNT = 15000;
const BULGE_COUNT = 3000;
const DUST_COUNT = 4200;
const STAR_COUNT = 800;
const ARM_COUNT = 2;
const TURNS = 2.8;
const INNER_RADIUS = 4;
const OUTER_RADIUS = 55;
const INTRO_DELAY = 0.5;
const INTRO_DURATION = 3.2;
const SPIN_SPEED = 0.014;
const VIEW_TILT_X = 0.05;
const VIEW_TILT_Y = -0.035;
const VIEW_TILT_Z = -0.02;
const INTRO_TILT = 0.4;

function spiralPoint(arm: number, t: number) {
	const theta = t * TURNS * Math.PI * 2;
	const radius = INNER_RADIUS * (OUTER_RADIUS / INNER_RADIUS) ** t;
	const angle = theta + (arm / ARM_COUNT) * Math.PI * 2;
	return { radius, angle };
}

function armClumping(t: number, arm: number) {
	const phase = arm * 2.7;
	const knots =
		Math.sin(t * 47 + phase) * 0.5 +
		Math.sin(t * 19.3 + phase * 1.7) * 0.32 +
		Math.sin(t * 7.1 + phase * 0.6) * 0.18;
	return 0.35 + 0.65 * (knots * 0.5 + 0.5);
}

function gaussian() {
	let u = 0;
	let v = 0;
	while (u === 0) u = Math.random();
	while (v === 0) v = Math.random();
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

const BOKEH_VERTEX = `
	#define PI 3.14159265359

	attribute float aSize;
	attribute float aBlur;
	attribute float aTwinkle;
	attribute float aRadius;
	attribute float aSeed;
	attribute float aTravel;
	attribute vec3 aScatter;
	varying vec3 vColor;
	varying float vAlpha;
	varying float vBlur;
	varying float vBright;

	uniform float uPixelRatio;
	uniform float uTime;
	uniform float uFormation;
	uniform float uOpacity;
	uniform float uAmbient;
	uniform float uCoreBoost;
	uniform vec2 uScatterSize;
	uniform float uTilt;

	float revealProgress(float progress, float seed) {
		float delay = seed * 0.02;
		return smoothstep(delay, 0.18 + delay, progress)
			* mix(0.15, 1.0, smoothstep(0.25, 1.0, progress));
	}

	vec3 introMotion(
		vec3 target, vec3 scattered, float progress, float seed, float travelSeed
	) {
		if (progress >= 1.0) return target;
		float start = 0.12 + seed * 0.2;
		float duration = 0.62 + travelSeed * 0.12;
		float local = clamp((progress - start) / duration, 0.0, 1.0);
		float smoothPull =
			local * local * local * (local * (local * 6.0 - 15.0) + 10.0);
		float pull = mix(smoothPull, sin(smoothPull * PI * 0.5), 0.5);
		float angle = sin(pull * PI) * (0.42 + seed * 0.2);
		float c = cos(angle);
		float s = sin(angle);
		vec3 orbiting = vec3(
			scattered.x * c - scattered.y * s,
			scattered.x * s + scattered.y * c,
			scattered.z
		);
		return mix(orbiting, target, pull);
	}

	vec3 tiltSpiral(vec3 p, float angle) {
		float c = cos(angle);
		float s = sin(angle);
		return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
	}

	void main() {
		vBlur = aBlur;

		float reveal = revealProgress(uFormation, aSeed);
		vec3 scattered = vec3(aScatter.xy * uScatterSize, aScatter.z * 8.0);
		vec3 animated = introMotion(
			tiltSpiral(position, uTilt * (1.0 - uFormation)),
			scattered,
			uFormation,
			aSeed,
			aTravel
		);

		vec4 mvPosition = modelViewMatrix * vec4(animated, 1.0);
		float dist = max(1.0, -mvPosition.z);
		gl_PointSize = clamp(
			aSize * uPixelRatio * (82.0 / dist) * sqrt(reveal),
			1.0,
			180.0
		);
		gl_Position = projectionMatrix * mvPosition;

		float coreGlow = pow(1.0 - aRadius, 2.6);
		float twinkle = 0.9 + 0.1 * sin(uTime * 0.38 + aTwinkle);
		float lit = uAmbient + coreGlow * uCoreBoost;
		vColor = color * lit;
		vBright = lit * (1.0 - vBlur * 0.7) + aSize * 0.04 + coreGlow * 0.35;
		vAlpha = uOpacity * twinkle * reveal * (0.55 + coreGlow * 0.45);
	}
`;

const BOKEH_FRAGMENT = `
	varying vec3 vColor;
	varying float vAlpha;
	varying float vBlur;
	varying float vBright;

	void main() {
		vec2 uv = gl_PointCoord - vec2(0.5);
		float d = length(uv) * 2.0;
		if (d > 1.0) discard;

		float disc = 1.0 - smoothstep(1.0 - vBlur * 0.82 - 0.06, 1.0, d);
		float rim = smoothstep(0.55, 0.95, d) * (1.0 - smoothstep(0.95, 1.0, d)) * vBlur * 0.4;
		float core = exp(-d * d * mix(14.0, 2.8, vBlur));
		float bokeh = disc * mix(0.4, 0.95, vBlur) + core + rim;

		float angle = atan(uv.y, uv.x);
		float spikes = pow(abs(cos(angle * 2.0)), 7.0) * pow(1.0 - d, 1.1);
		float starburst = spikes * smoothstep(0.48, 0.9, vBright) * (1.0 - vBlur * 0.8);

		float alpha = bokeh * vAlpha + starburst * vAlpha * 0.38;
		if (alpha < 0.003) discard;

		vec3 col = vColor + vec3(starburst * 0.55);
		gl_FragColor = vec4(col, alpha);
	}
`;

const DUST_FRAGMENT = `
	varying vec3 vColor;
	varying float vAlpha;

	void main() {
		vec2 uv = gl_PointCoord - vec2(0.5);
		float d = dot(uv, uv) * 4.0;
		float alpha = exp(-d * 2.8) * vAlpha;
		if (alpha < 0.003) discard;
		gl_FragColor = vec4(vColor, alpha);
	}
`;

type FieldKind = "grain" | "dust" | "bulge";

function buildSpiralGeometry(count: number, kind: FieldKind) {
	const dust = kind === "dust";
	const positions = new Float32Array(count * 3);
	const colors = new Float32Array(count * 3);
	const sizes = new Float32Array(count);
	const blurs = new Float32Array(count);
	const radii = new Float32Array(count);
	const twinkles = new Float32Array(count);
	const seeds = new Float32Array(count);
	const travels = new Float32Array(count);
	const scatters = new Float32Array(count * 3);

	const white = new THREE.Color("#eef1f4");
	const cool = new THREE.Color("#c5d6e6");
	const cyan = new THREE.Color("#7ec4e8");
	const blue = new THREE.Color("#8ab4f0");
	const ember = new THREE.Color("#e08048");
	const amber = new THREE.Color("#e8a060");

	for (let i = 0; i < count; i++) {
		const i3 = i * 3;
		const arm = i % ARM_COUNT;
		const t = kind === "bulge" ? Math.random() ** 2.2 : Math.random() ** 0.8;
		const { radius, angle } = spiralPoint(arm, t);
		const clump = armClumping(t, arm);

		if (kind === "bulge") {
			const bulgeRadius = Math.abs(gaussian()) * 2.4;
			const bulgeAngle = Math.random() * Math.PI * 2;
			positions[i3] = Math.cos(bulgeAngle) * bulgeRadius;
			positions[i3 + 1] = Math.sin(bulgeAngle) * bulgeRadius;
			positions[i3 + 2] = gaussian() * 0.7;
			radii[i] = Math.min(1, bulgeRadius / 3);
		} else {
			const width = (dust ? 1.5 : 0.55) * (0.38 + radius * 0.055);
			const offset = gaussian() * width;
			const alongJitter = gaussian() * width * 0.55;
			positions[i3] =
				Math.cos(angle) * radius +
				Math.cos(angle + Math.PI / 2) * offset +
				Math.cos(angle) * alongJitter;
			positions[i3 + 1] =
				Math.sin(angle) * radius +
				Math.sin(angle + Math.PI / 2) * offset +
				Math.sin(angle) * alongJitter;
			positions[i3 + 2] = gaussian() * (dust ? 1.4 : 0.45);
			radii[i] = t;
		}

		let color: THREE.Color;
		let sizeBias = 1;
		const roll = Math.random();

		if (kind === "bulge") {
			color = roll < 0.15 ? amber : white;
		} else if (roll < 0.06) {
			color = ember;
			sizeBias = 1.1;
		} else if (roll < 0.11) {
			color = amber;
			sizeBias = 1.05;
		} else if (roll < 0.2) {
			color = cyan;
			sizeBias = 0.95;
		} else if (roll < 0.3) {
			color = blue;
			sizeBias = 0.92;
		} else if (roll < 0.55) {
			color = cool;
		} else {
			color = white;
		}

		colors[i3] = color.r;
		colors[i3 + 1] = color.g;
		colors[i3 + 2] = color.b;

		if (dust) {
			sizes[i] = (18 + Math.random() * 28) * clump;
			blurs[i] = 1;
		} else if (kind === "bulge") {
			sizes[i] = 0.6 + Math.random() ** 2.8 * 2.8;
			blurs[i] = Math.random() * 0.3;
		} else {
			const roughness = Math.random() ** 3.4;
			sizes[i] = (0.7 + roughness * 6.5) * sizeBias * (0.6 + clump * 0.85);
			blurs[i] = Math.min(1, roughness * 1.45 + Math.random() * 0.15);
		}

		twinkles[i] = Math.random() * Math.PI * 2;
		seeds[i] = Math.random();
		travels[i] = Math.random();
		scatters[i3] = Math.random() - 0.5;
		scatters[i3 + 1] = Math.random() - 0.5;
		scatters[i3 + 2] = Math.random() - 0.5;
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
	geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
	geometry.setAttribute("aBlur", new THREE.BufferAttribute(blurs, 1));
	geometry.setAttribute("aRadius", new THREE.BufferAttribute(radii, 1));
	geometry.setAttribute("aTwinkle", new THREE.BufferAttribute(twinkles, 1));
	geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
	geometry.setAttribute("aTravel", new THREE.BufferAttribute(travels, 1));
	geometry.setAttribute("aScatter", new THREE.BufferAttribute(scatters, 3));
	return geometry;
}

type BokehOptions = {
	ambient: number;
	coreBoost: number;
	soft?: boolean;
};

function createBokehMaterial(opacity: number, options: BokehOptions) {
	return new THREE.ShaderMaterial({
		transparent: true,
		depthTest: false,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		vertexColors: true,
		uniforms: {
			uTime: { value: 0 },
			uPixelRatio: { value: 1 },
			uFormation: { value: 0 },
			uOpacity: { value: opacity },
			uAmbient: { value: options.ambient },
			uCoreBoost: { value: options.coreBoost },
			uScatterSize: { value: new THREE.Vector2(80, 80) },
			uTilt: { value: INTRO_TILT },
		},
		vertexShader: BOKEH_VERTEX,
		fragmentShader: options.soft ? DUST_FRAGMENT : BOKEH_FRAGMENT,
	});
}

function createStarField(): THREE.Points {
	const positions = new Float32Array(STAR_COUNT * 3);
	const colors = new Float32Array(STAR_COUNT * 3);
	const sizes = new Float32Array(STAR_COUNT);

	for (let i = 0; i < STAR_COUNT; i++) {
		const i3 = i * 3;
		positions[i3] = (Math.random() - 0.5) * 360;
		positions[i3 + 1] = (Math.random() - 0.5) * 360;
		positions[i3 + 2] = -70 - Math.random() * 80;

		const brightness = 0.22 + Math.random() ** 2.2 * 0.55;
		colors[i3] = brightness;
		colors[i3 + 1] = brightness;
		colors[i3 + 2] = brightness * (0.96 + Math.random() * 0.08);
		sizes[i] = 0.5 + Math.random() ** 3 * 2.2;
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
	geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

	const material = new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		vertexColors: true,
		uniforms: { uPixelRatio: { value: 1 } },
		vertexShader: `
			attribute float aSize;
			varying vec3 vColor;
			uniform float uPixelRatio;
			void main() {
				vColor = color;
				vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
				gl_PointSize = clamp(aSize * uPixelRatio, 0.6, 2.8);
				gl_Position = projectionMatrix * mvPosition;
			}
		`,
		fragmentShader: `
			varying vec3 vColor;
			void main() {
				vec2 uv = gl_PointCoord - vec2(0.5);
				float alpha = exp(-dot(uv, uv) * 16.0);
				if (alpha < 0.02) discard;
				gl_FragColor = vec4(vColor, alpha * 0.55);
			}
		`,
	});

	return new THREE.Points(geometry, material);
}

function radialSprite(stops: [number, string][], scale: number): THREE.Sprite {
	const canvas = document.createElement("canvas");
	canvas.width = 512;
	canvas.height = 512;
	const ctx = canvas.getContext("2d");
	if (ctx) {
		const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
		for (const [offset, color] of stops) gradient.addColorStop(offset, color);
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, 512, 512);
	}

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	const sprite = new THREE.Sprite(
		new THREE.SpriteMaterial({
			map: texture,
			transparent: true,
			blending: THREE.AdditiveBlending,
			depthTest: false,
			depthWrite: false,
		}),
	);
	sprite.scale.set(scale, scale, 1);
	return sprite;
}

type SpaceBackgroundProps = {
	onReplayReady?: (replay: () => void) => void;
};

export function SpaceBackground({ onReplayReady }: SpaceBackgroundProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const replayRef = useRef<(() => void) | null>(null);

	const replay = useCallback(() => {
		replayRef.current?.();
	}, []);

	useEffect(() => {
		onReplayReady?.(replay);
	}, [onReplayReady, replay]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const renderer = new THREE.WebGLRenderer({
			antialias: true,
			alpha: false,
			powerPreference: "high-performance",
		});
		renderer.setClearColor(0x000000, 1);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.05;
		renderer.domElement.style.width = "100%";
		renderer.domElement.style.height = "100%";
		renderer.domElement.style.display = "block";
		container.appendChild(renderer.domElement);

		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 600);
		camera.position.set(0, 0, 78);

		const composer = new EffectComposer(renderer);
		composer.addPass(new RenderPass(scene, camera));
		const bloomPass = new UnrealBloomPass(
			new THREE.Vector2(1, 1),
			0.52,
			0.55,
			0.38,
		);
		composer.addPass(bloomPass);

		const stars = createStarField();
		scene.add(stars);

		const spiralGroup = new THREE.Group();
		spiralGroup.rotation.set(VIEW_TILT_X, VIEW_TILT_Y, VIEW_TILT_Z);
		scene.add(spiralGroup);

		const dustGeometry = buildSpiralGeometry(DUST_COUNT, "dust");
		const dustMaterial = createBokehMaterial(0.065, {
			ambient: 0.42,
			coreBoost: 0.55,
			soft: true,
		});
		const dust = new THREE.Points(dustGeometry, dustMaterial);
		dust.frustumCulled = false;
		spiralGroup.add(dust);

		const bulgeGeometry = buildSpiralGeometry(BULGE_COUNT, "bulge");
		const bulgeMaterial = createBokehMaterial(0.82, {
			ambient: 0.85,
			coreBoost: 1.4,
		});
		const bulge = new THREE.Points(bulgeGeometry, bulgeMaterial);
		bulge.frustumCulled = false;
		spiralGroup.add(bulge);

		const grainGeometry = buildSpiralGeometry(PARTICLE_COUNT, "grain");
		const grainMaterial = createBokehMaterial(0.78, {
			ambient: 0.62,
			coreBoost: 0.95,
		});
		const grains = new THREE.Points(grainGeometry, grainMaterial);
		grains.frustumCulled = false;
		spiralGroup.add(grains);

		const halo = radialSprite(
			[
				[0, "rgba(255,245,235,0.12)"],
				[0.3, "rgba(230,225,220,0.04)"],
				[1, "rgba(200,200,210,0)"],
			],
			155,
		);
		spiralGroup.add(halo);

		const core = radialSprite(
			[
				[0, "rgba(255,255,252,1)"],
				[0.1, "rgba(255,252,245,0.85)"],
				[0.22, "rgba(245,248,255,0.45)"],
				[0.45, "rgba(225,235,255,0.12)"],
				[1, "rgba(200,220,255,0)"],
			],
			50,
		);
		spiralGroup.add(core);

		const starsMaterial = stars.material as THREE.ShaderMaterial;
		const particleMaterials = [grainMaterial, dustMaterial, bulgeMaterial];

		let formationStart = performance.now();
		let spin = 0;
		const reducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;

		replayRef.current = () => {
			formationStart = performance.now();
		};

		const resize = () => {
			const width = Math.max(1, container.clientWidth);
			const height = Math.max(1, container.clientHeight);
			renderer.setSize(width, height, false);
			composer.setSize(width, height);
			bloomPass.resolution.set(width, height);

			const pixelRatio = renderer.getPixelRatio();
			grainMaterial.uniforms.uPixelRatio.value = pixelRatio;
			dustMaterial.uniforms.uPixelRatio.value = pixelRatio;
			bulgeMaterial.uniforms.uPixelRatio.value = pixelRatio;
			starsMaterial.uniforms.uPixelRatio.value = pixelRatio;
			camera.aspect = width / height;
			camera.updateProjectionMatrix();

			const visibleHeight =
				2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
			for (const material of particleMaterials) {
				material.uniforms.uScatterSize.value.set(
					visibleHeight * camera.aspect,
					visibleHeight,
				);
			}

			const fit = Math.min(1, Math.max(0.65, width / 1080));
			spiralGroup.scale.setScalar(fit);
		};

		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(container);

		const clock = new THREE.Clock();
		let rafId = 0;

		const animate = () => {
			rafId = window.requestAnimationFrame(animate);
			const delta = Math.min(clock.getDelta(), 0.05);
			const t = clock.elapsedTime;
			const introElapsed = (performance.now() - formationStart) / 1000;
			const formation = reducedMotion
				? 1
				: Math.min(
						1,
						Math.max(0, introElapsed - INTRO_DELAY) / INTRO_DURATION,
					);

			for (const material of particleMaterials) {
				material.uniforms.uTime.value = t;
				material.uniforms.uFormation.value = formation;
			}

			if (!reducedMotion) spin = (spin + delta * SPIN_SPEED) % (Math.PI * 2);
			spiralGroup.rotation.z = VIEW_TILT_Z + spin;

			(core.material as THREE.SpriteMaterial).opacity = formation ** 2 * 0.92;
			(halo.material as THREE.SpriteMaterial).opacity = formation * 0.88;

			composer.render();
		};
		animate();

		return () => {
			window.cancelAnimationFrame(rafId);
			ro.disconnect();
			replayRef.current = null;

			for (const sprite of [halo, core]) {
				const material = sprite.material as THREE.SpriteMaterial;
				material.map?.dispose();
				material.dispose();
			}
			stars.geometry.dispose();
			starsMaterial.dispose();
			grainGeometry.dispose();
			grainMaterial.dispose();
			dustGeometry.dispose();
			dustMaterial.dispose();
			bulgeGeometry.dispose();
			bulgeMaterial.dispose();
			composer.dispose();
			renderer.dispose();

			if (renderer.domElement.parentElement === container) {
				container.removeChild(renderer.domElement);
			}
		};
	}, []);

	return (
		<div
			ref={containerRef}
			className="absolute inset-0 z-0"
			aria-label="Animated spiral star field"
			role="img"
		/>
	);
}

export function ReplayButton({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="absolute bottom-6 right-6 z-20 flex size-11 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white/80 backdrop-blur-sm transition hover:border-white/30 hover:bg-black/55 hover:text-white"
			aria-label="Replay spiral field animation"
		>
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<path d="M3 12a9 9 0 1 0 2.4-6.1" />
				<path d="M3 4v5h5" />
			</svg>
		</button>
	);
}
