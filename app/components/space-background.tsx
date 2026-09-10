"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

const PARTICLE_COUNT = 12000;
const BULGE_COUNT = 2200;
const DUST_COUNT = 1600;
const STAR_COUNT = 900;
const ARM_COUNT = 2;
const TURNS = 2.2;
const INNER_RADIUS = 4;
const OUTER_RADIUS = 52;
const INTRO_DURATION = 3.4;

/**
 * Near-Archimedean spiral with a slight outward bias, so inner turns stay tight
 * while the outer sweep opens up.
 */
function spiralPoint(arm: number, t: number) {
	const theta = t * TURNS * Math.PI * 2;
	const radius = INNER_RADIUS + (OUTER_RADIUS - INNER_RADIUS) * t ** 1.22;
	const angle = theta + (arm / ARM_COUNT) * Math.PI * 2;
	return { radius, angle };
}

/** Irregular knots so the arms read as clumped dust rather than even beading. */
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
	attribute float aSize;
	attribute float aT;
	attribute float aTwinkle;
	attribute float aBlur;
	varying vec3 vColor;
	varying float vAlpha;
	varying float vBlur;
	uniform float uPixelRatio;
	uniform float uTime;
	uniform float uFormation;
	uniform float uSizeScale;
	uniform float uOpacity;

	void main() {
		vColor = color;
		vBlur = aBlur;

		// Particles swirl inward into their final spiral slot, staggered from the core outward.
		float local = clamp((uFormation - aT * 0.48) / 0.52, 0.0, 1.0);
		float ease = 1.0 - pow(1.0 - local, 3.0);

		float radius = length(position.xy);
		float angle = atan(position.y, position.x);
		float animRadius = mix(radius * 2.15, radius, ease);
		float animAngle = angle + (1.0 - ease) * 1.6;
		vec3 animated = vec3(
			cos(animAngle) * animRadius,
			sin(animAngle) * animRadius,
			position.z * ease
		);

		vec4 mvPosition = modelViewMatrix * vec4(animated, 1.0);
		float dist = max(1.0, -mvPosition.z);
		gl_PointSize = clamp(aSize * uSizeScale * uPixelRatio * (78.0 / dist), 1.0, 160.0);
		gl_Position = projectionMatrix * mvPosition;

		float twinkle = 0.82 + 0.18 * sin(uTime * 0.9 + aTwinkle);
		vAlpha = ease * twinkle * uOpacity;
	}
`;

/**
 * Wide-aperture look: sharp pinpoints keep a tight core, while out-of-focus
 * particles spread into soft discs with a faint outer ring. uSoft dials the
 * whole thing down to a plain gaussian, used for the nebular haze where visible
 * disc edges would read as smudges.
 */
const BOKEH_FRAGMENT = `
	varying vec3 vColor;
	varying float vAlpha;
	varying float vBlur;
	uniform float uSoft;

	void main() {
		vec2 uv = gl_PointCoord - vec2(0.5);
		float d = length(uv) * 2.0;
		if (d > 1.0) discard;

		float disc = 1.0 - smoothstep(1.0 - vBlur * 0.85 - 0.08, 1.0, d);
		float rim = smoothstep(0.55, 0.95, d) * (1.0 - smoothstep(0.95, 1.0, d)) * vBlur * 0.45;
		float core = exp(-d * d * mix(9.0, 2.2, vBlur));
		float bokeh = disc * mix(0.35, 0.9, vBlur) + core + rim;
		float haze = exp(-d * d * 3.2) * (1.0 - smoothstep(0.7, 1.0, d));

		float alpha = mix(bokeh, haze, uSoft) * vAlpha;
		if (alpha < 0.004) discard;

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
	const ts = new Float32Array(count);
	const twinkles = new Float32Array(count);

	const white = new THREE.Color("#ffffff");
	const coolWhite = new THREE.Color("#dbe8ff");
	const blue = new THREE.Color("#b6cdea");
	const amber = new THREE.Color("#e8a86a");

	for (let i = 0; i < count; i++) {
		const i3 = i * 3;
		const arm = i % ARM_COUNT;
		const t = kind === "bulge" ? Math.random() ** 2 : Math.random() ** 0.82;
		const { radius, angle } = spiralPoint(arm, t);
		const clump = armClumping(t, arm);

		if (kind === "bulge") {
			// Dense luminous core: a flattened gaussian cloud around the centre.
			const bulgeRadius = Math.abs(gaussian()) * 2.6;
			const bulgeAngle = Math.random() * Math.PI * 2;
			positions[i3] = Math.cos(bulgeAngle) * bulgeRadius;
			positions[i3 + 1] = Math.sin(bulgeAngle) * bulgeRadius;
			positions[i3 + 2] = gaussian() * 0.8;
		} else {
			// Keep grains hugging the arm centreline; the ribbon widens as it unwinds.
			const width = (dust ? 1.6 : 0.62) * (0.4 + radius * 0.06);
			const offset = gaussian() * width;
			const alongJitter = gaussian() * width * 0.6;
			positions[i3] =
				Math.cos(angle) * radius +
				Math.cos(angle + Math.PI / 2) * offset +
				Math.cos(angle) * alongJitter;
			positions[i3 + 1] =
				Math.sin(angle) * radius +
				Math.sin(angle + Math.PI / 2) * offset +
				Math.sin(angle) * alongJitter;
			positions[i3 + 2] = gaussian() * (dust ? 1.6 : 0.5);
		}

		let color: THREE.Color;
		let sizeBias = 1;
		const roll = Math.random();
		if (kind === "bulge") {
			color = roll < 0.3 ? coolWhite : white;
		} else if (roll < 0.14) {
			color = amber;
			sizeBias = 0.72;
		} else if (roll < 0.32) {
			color = blue;
			sizeBias = 0.9;
		} else if (roll < 0.6) {
			color = coolWhite;
		} else {
			color = white;
		}

		colors[i3] = color.r;
		colors[i3 + 1] = color.g;
		colors[i3 + 2] = color.b;

		if (dust) {
			sizes[i] = (16 + Math.random() * 24) * clump;
			blurs[i] = 1;
		} else if (kind === "bulge") {
			sizes[i] = 0.5 + Math.random() ** 3 * 2.4;
			blurs[i] = Math.random() * 0.35;
		} else {
			// Mostly pinpoints, a scattered few blooming into soft bokeh discs.
			const roughness = Math.random() ** 4.2;
			sizes[i] = (0.5 + roughness * 5.6) * sizeBias * (0.55 + clump * 0.8);
			blurs[i] = Math.min(1, roughness * 1.4 + Math.random() * 0.2);
		}

		ts[i] = t;
		twinkles[i] = Math.random() * Math.PI * 2;
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
	geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
	geometry.setAttribute("aBlur", new THREE.BufferAttribute(blurs, 1));
	geometry.setAttribute("aT", new THREE.BufferAttribute(ts, 1));
	geometry.setAttribute("aTwinkle", new THREE.BufferAttribute(twinkles, 1));
	return geometry;
}

function createBokehMaterial(opacity: number, sizeScale: number) {
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
			uSizeScale: { value: sizeScale },
		},
		vertexShader: BOKEH_VERTEX,
		fragmentShader: BOKEH_FRAGMENT,
	});
}

function createStarField(): THREE.Points {
	const positions = new Float32Array(STAR_COUNT * 3);
	const colors = new Float32Array(STAR_COUNT * 3);
	const sizes = new Float32Array(STAR_COUNT);

	for (let i = 0; i < STAR_COUNT; i++) {
		const i3 = i * 3;
		positions[i3] = (Math.random() - 0.5) * 340;
		positions[i3 + 1] = (Math.random() - 0.5) * 340;
		positions[i3 + 2] = -60 - Math.random() * 60;

		const brightness = 0.3 + Math.random() ** 2 * 0.7;
		colors[i3] = brightness;
		colors[i3 + 1] = brightness;
		colors[i3 + 2] = brightness * (0.95 + Math.random() * 0.1);
		sizes[i] = 0.6 + Math.random() ** 3 * 2.6;
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
				gl_PointSize = clamp(aSize * uPixelRatio, 0.8, 3.0);
				gl_Position = projectionMatrix * mvPosition;
			}
		`,
		fragmentShader: `
			varying vec3 vColor;

			void main() {
				vec2 uv = gl_PointCoord - vec2(0.5);
				float alpha = exp(-dot(uv, uv) * 14.0);
				if (alpha < 0.02) discard;
				gl_FragColor = vec4(vColor, alpha * 0.7);
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
	const [isDragging, setIsDragging] = useState(false);

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
		renderer.setClearColor(0x01030a, 1);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.domElement.style.width = "100%";
		renderer.domElement.style.height = "100%";
		renderer.domElement.style.display = "block";
		renderer.domElement.style.touchAction = "none";
		container.appendChild(renderer.domElement);

		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 600);
		camera.position.set(0, 0, 78);

		const stars = createStarField();
		scene.add(stars);

		const spiralGroup = new THREE.Group();
		spiralGroup.rotation.x = 0.14;
		scene.add(spiralGroup);

		const dustGeometry = buildSpiralGeometry(DUST_COUNT, "dust");
		const dustMaterial = createBokehMaterial(0.12, 1);
		const dust = new THREE.Points(dustGeometry, dustMaterial);
		dust.frustumCulled = false;
		spiralGroup.add(dust);

		const bulgeGeometry = buildSpiralGeometry(BULGE_COUNT, "bulge");
		const bulgeMaterial = createBokehMaterial(0.9, 1);
		const bulge = new THREE.Points(bulgeGeometry, bulgeMaterial);
		bulge.frustumCulled = false;
		spiralGroup.add(bulge);

		const grainGeometry = buildSpiralGeometry(PARTICLE_COUNT, "grain");
		const grainMaterial = createBokehMaterial(1, 1);
		const grains = new THREE.Points(grainGeometry, grainMaterial);
		grains.frustumCulled = false;
		spiralGroup.add(grains);

		const halo = radialSprite(
			[
				[0, "rgba(190,212,255,0.08)"],
				[0.4, "rgba(140,170,225,0.028)"],
				[1, "rgba(120,150,210,0)"],
			],
			130,
		);
		spiralGroup.add(halo);

		const core = radialSprite(
			[
				[0, "rgba(255,254,250,1)"],
				[0.14, "rgba(255,250,238,0.72)"],
				[0.32, "rgba(240,246,255,0.3)"],
				[0.6, "rgba(215,230,255,0.08)"],
				[1, "rgba(200,220,255,0)"],
			],
			30,
		);
		spiralGroup.add(core);

		const starsMaterial = stars.material as THREE.ShaderMaterial;

		let formationStart = performance.now();
		let baseRotation = 0;
		let dragRotation = 0;
		let spinVelocity = 0;
		let isPointerDown = false;
		let lastPointerX = 0;

		replayRef.current = () => {
			formationStart = performance.now();
		};

		const onPointerDown = (event: PointerEvent) => {
			isPointerDown = true;
			lastPointerX = event.clientX;
			spinVelocity = 0;
			setIsDragging(true);
			renderer.domElement.setPointerCapture(event.pointerId);
		};

		const onPointerMove = (event: PointerEvent) => {
			if (!isPointerDown) return;
			const delta = (event.clientX - lastPointerX) * 0.005;
			dragRotation += delta;
			spinVelocity = delta;
			lastPointerX = event.clientX;
		};

		const onPointerUp = (event: PointerEvent) => {
			if (!isPointerDown) return;
			isPointerDown = false;
			setIsDragging(false);
			renderer.domElement.releasePointerCapture(event.pointerId);
		};

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "ArrowLeft") spinVelocity += 0.012;
			if (event.key === "ArrowRight") spinVelocity -= 0.012;
		};

		renderer.domElement.addEventListener("pointerdown", onPointerDown);
		renderer.domElement.addEventListener("pointermove", onPointerMove);
		renderer.domElement.addEventListener("pointerup", onPointerUp);
		renderer.domElement.addEventListener("pointercancel", onPointerUp);
		window.addEventListener("keydown", onKeyDown);

		const resize = () => {
			const width = Math.max(1, container.clientWidth);
			const height = Math.max(1, container.clientHeight);
			renderer.setSize(width, height, false);
			const pixelRatio = renderer.getPixelRatio();
			grainMaterial.uniforms.uPixelRatio.value = pixelRatio;
			dustMaterial.uniforms.uPixelRatio.value = pixelRatio;
			bulgeMaterial.uniforms.uPixelRatio.value = pixelRatio;
			starsMaterial.uniforms.uPixelRatio.value = pixelRatio;
			camera.aspect = width / height;
			camera.updateProjectionMatrix();

			// Keep the spiral framed the same way on narrow viewports.
			const fit = Math.min(1, Math.max(0.62, width / 1100));
			spiralGroup.scale.setScalar(fit);
		};

		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(container);

		const clock = new THREE.Clock();
		let rafId = 0;

		const animate = () => {
			rafId = window.requestAnimationFrame(animate);
			const t = clock.getElapsedTime();
			const formation = Math.min(
				1,
				(performance.now() - formationStart) / 1000 / INTRO_DURATION,
			);

			for (const material of [grainMaterial, dustMaterial, bulgeMaterial]) {
				material.uniforms.uTime.value = t;
				material.uniforms.uFormation.value = formation;
			}

			if (!isPointerDown) {
				dragRotation += spinVelocity;
				spinVelocity *= 0.94;
			}
			baseRotation += 0.0011;
			spiralGroup.rotation.z = baseRotation + dragRotation;

			(core.material as THREE.SpriteMaterial).opacity = formation ** 2;
			(halo.material as THREE.SpriteMaterial).opacity = formation;

			renderer.render(scene, camera);
		};
		animate();

		return () => {
			window.cancelAnimationFrame(rafId);
			ro.disconnect();
			replayRef.current = null;
			renderer.domElement.removeEventListener("pointerdown", onPointerDown);
			renderer.domElement.removeEventListener("pointermove", onPointerMove);
			renderer.domElement.removeEventListener("pointerup", onPointerUp);
			renderer.domElement.removeEventListener("pointercancel", onPointerUp);
			window.removeEventListener("keydown", onKeyDown);

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
			renderer.dispose();

			if (renderer.domElement.parentElement === container) {
				container.removeChild(renderer.domElement);
			}
		};
	}, []);

	return (
		<div
			ref={containerRef}
			className={`absolute inset-0 z-0 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
			aria-label="Drag or use arrow keys to rotate the star field"
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
