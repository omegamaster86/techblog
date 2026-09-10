"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

const PARTICLE_BUDGET = {
	high: { grain: 12000, bulge: 2200, dust: 4000, stars: 900 },
	medium: { grain: 8000, bulge: 1500, dust: 2600, stars: 600 },
	low: { grain: 5000, bulge: 900, dust: 1600, stars: 380 },
} as const;

const ARM_COUNT = 2;
const TURNS = 2.35;
const INNER_RADIUS = 5.5;
const OUTER_RADIUS = 52;
/** Astra shows the field almost immediately; a short beat before convergence. */
const INTRO_DELAY = 0.35;
const INTRO_DURATION = 4.2;
const FOLLOW_DAMPING = 6;
const RETURN_SPRING = 2.8;
/** Laps per second for the light that runs inward along the arms. */
const FLOW_SPEED = 0.09;
/** How far ahead of the travelling head a particle still catches light. */
const LIGHT_REACH = 0.17;
/** Fraction of the path that keeps a fading glow behind a head. */
const TRAIL_LENGTH = 0.06;
/** Offsets of the bright knots that travel along the arms together. */
const STAR_KNOTS = [0.15, 0.28, 0.38, 0.52, 0.62, 0.84, 0.94];
const TWINKLE_SPEED = 0.62;
/** Spiral tilt the field flattens out of while it converges. */
const INTRO_TILT = 0.5;
/** Radians per second the settled field keeps turning about its own axis. */
const SPIN_SPEED = 0.2;

type QualityTier = keyof typeof PARTICLE_BUDGET;

function getQualityTier(): QualityTier {
	const coarse = window.matchMedia("(pointer: coarse)").matches;
	const narrow = window.innerWidth < 768;
	const lowMemory =
		"deviceMemory" in navigator &&
		(navigator as Navigator & { deviceMemory?: number }).deviceMemory !==
			undefined &&
		((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <
			4;

	if (narrow || lowMemory) return "low";
	if (coarse || window.innerWidth < 1100) return "medium";
	return "high";
}

function getPixelRatioCap(tier: QualityTier): number {
	if (tier === "low") return 1.25;
	if (tier === "medium") return 1.5;
	return 2;
}

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
	#define PI 3.14159265359

	attribute float aSize;
	attribute float aT;
	attribute float aTwinkle;
	attribute float aBlur;
	attribute float aOrbit;
	attribute float aSeed;
	attribute float aTravel;
	attribute vec3 aScatter;
	attribute vec3 aTangent;
	varying vec3 vColor;
	varying float vAlpha;
	varying float vBlur;
	uniform float uPixelRatio;
	uniform float uTime;
	uniform float uFormation;
	uniform float uSizeScale;
	uniform float uOpacity;
	uniform float uAmbient;
	uniform float uStarBrightness;
	uniform float uHead;
	uniform float uKnots[${STAR_KNOTS.length}];
	uniform float uLightReach;
	uniform float uTrailLength;
	uniform float uDriftSpeed;
	uniform float uDriftDistance;
	uniform vec2 uScatterSize;
	uniform float uTilt;

	/** Fade in quickly, then keep gaining presence as the field settles. */
	float revealProgress(float progress, float seed) {
		float delay = seed * 0.015;
		return smoothstep(delay, 0.14 + delay, progress)
			* mix(0.2, 1.0, smoothstep(0.2, 1.0, progress));
	}

	/**
	 * Every particle starts scattered across the frame and swirls into its slot
	 * on its own schedule, arcing sideways before it lands.
	 */
	vec3 introMotion(
		vec3 target, vec3 scattered, float progress, float seed, float travelSeed
	) {
		if (progress >= 1.0) return target;
		float start = 0.14 + seed * 0.18;
		float duration = 0.58 + travelSeed * 0.1;
		float local = clamp((progress - start) / duration, 0.0, 1.0);
		float smoothPull =
			local * local * local * (local * (local * 6.0 - 15.0) + 10.0);
		float pull = mix(smoothPull, sin(smoothPull * PI * 0.5), 0.5);
		float angle = sin(pull * PI) * (0.44 + seed * 0.22);
		float c = cos(angle);
		float s = sin(angle);
		vec3 orbiting = vec3(
			scattered.x * c - scattered.y * s,
			scattered.x * s + scattered.y * c,
			scattered.z
		);
		return mix(orbiting, target, pull);
	}

	/** Rotates the disc about its own X axis, so it can flatten as it forms. */
	vec3 tiltSpiral(vec3 p, float angle) {
		float c = cos(angle);
		float s = sin(angle);
		return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
	}

	void main() {
		vBlur = aBlur;

		// A row of bright knots runs inward along the arms; particles flare as one
		// passes and keep a shorter glow in its wake.
		float illumination = 0.0;
		for (int k = 0; k < ${STAR_KNOTS.length}; k++) {
			float knot = fract(uHead + uKnots[k]);
			float toStar = abs(aOrbit - knot);
			toStar = min(toStar, 1.0 - toStar);
			float lit = 1.0 - smoothstep(uLightReach * 0.08, uLightReach, toStar);
			float behind = fract(aOrbit - knot);
			float trail = 1.0 - smoothstep(0.0, uTrailLength, behind);
			illumination = max(illumination, max(lit * lit, trail * trail * 0.68));
		}

		// Slow stream along the arm, each particle fading in and out of its cycle.
		float driftCycle = fract(aSeed + uTime * uDriftSpeed);
		float driftFade = smoothstep(0.0, 0.1, driftCycle)
			* (1.0 - smoothstep(0.9, 1.0, driftCycle));
		vec3 basePosition =
			position - aTangent * (driftCycle - 0.5) * uDriftDistance;

		float reveal = revealProgress(uFormation, aSeed);
		vec3 scattered = vec3(aScatter.xy * uScatterSize, aScatter.z * 8.0);
		vec3 animated = introMotion(
			tiltSpiral(basePosition, uTilt * (1.0 - uFormation)),
			scattered,
			uFormation,
			aSeed,
			aTravel
		);

		vec4 mvPosition = modelViewMatrix * vec4(animated, 1.0);
		float dist = max(1.0, -mvPosition.z);
		gl_PointSize = clamp(
			aSize * uSizeScale * uPixelRatio * (78.0 / dist) * sqrt(reveal),
			1.0,
			160.0
		);
		gl_Position = projectionMatrix * mvPosition;

		float twinkle = 0.82 + 0.18 * sin(uTime * ${TWINKLE_SPEED} + aTwinkle);
		vColor = color * (uAmbient + illumination * uStarBrightness);
		vAlpha = uOpacity
			* (0.22 + illumination * 0.78)
			* mix(1.0, driftFade, step(0.0001, uDriftSpeed))
			* twinkle
			* reveal;
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
		float core = exp(-d * d * mix(12.0, 2.6, vBlur));
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
	const orbits = new Float32Array(count);
	const seeds = new Float32Array(count);
	const travels = new Float32Array(count);
	const scatters = new Float32Array(count * 3);
	const tangents = new Float32Array(count * 3);

	const white = new THREE.Color("#f7f6f6");
	const cyan = new THREE.Color("#6dcbf4");
	const blue = new THREE.Color("#7ab1fe");
	const ember = new THREE.Color("#f87915");
	const amber = new THREE.Color("#fa994c");

	for (let i = 0; i < count; i++) {
		const i3 = i * 3;
		const arm = i % ARM_COUNT;
		const t = kind === "bulge" ? Math.random() ** 2 : Math.random() ** 0.82;
		const { radius, angle } = spiralPoint(arm, t);
		const clump = armClumping(t, arm);

		if (kind === "bulge") {
			// Dense luminous core: a flattened gaussian cloud around the centre.
			const bulgeRadius = Math.abs(gaussian()) * 2.1;
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
		// Reference palette: ~70% white, ~20% cool, ~10% warm.
		if (kind === "bulge") {
			color = roll < 0.14 ? amber : white;
		} else if (roll < 0.07) {
			color = ember;
			sizeBias = 0.95;
		} else if (roll < 0.1) {
			color = amber;
		} else if (roll < 0.2) {
			color = cyan;
			sizeBias = 0.86;
		} else if (roll < 0.3) {
			color = blue;
			sizeBias = 0.9;
		} else {
			color = white;
		}

		colors[i3] = color.r;
		colors[i3 + 1] = color.g;
		colors[i3 + 2] = color.b;

		if (dust) {
			sizes[i] = (21 + Math.random() * 34) * clump;
			blurs[i] = 1;
		} else if (kind === "bulge") {
			sizes[i] = 0.5 + Math.random() ** 3 * 2.4;
			blurs[i] = Math.random() * 0.35;
		} else {
			// Mostly pinpoints, a scattered few blooming into soft bokeh discs.
			// Kept small enough that the arms stay grainy instead of fusing into
			// blown-out ribbons, which is what washes the colour out.
			const roughness = Math.random() ** 3.6;
			sizes[i] = (0.5 + roughness * 4.8) * sizeBias * (0.55 + clump * 0.8);
			blurs[i] = Math.min(1, roughness * 1.65 + Math.random() * 0.28);
		}

		ts[i] = t;
		twinkles[i] = Math.random() * Math.PI * 2;
		// The core is treated as the end of the path, so the head lands on it.
		orbits[i] = kind === "bulge" ? Math.random() * 0.02 : t;
		seeds[i] = Math.random();
		travels[i] = Math.random();
		scatters[i3] = Math.random() - 0.5;
		scatters[i3 + 1] = Math.random() - 0.5;
		scatters[i3 + 2] = Math.random() - 0.5;

		// Forward direction along the arm, used for the inward drift.
		const ahead = spiralPoint(arm, Math.min(1, t + 0.004));
		const dx = Math.cos(ahead.angle) * ahead.radius - Math.cos(angle) * radius;
		const dy = Math.sin(ahead.angle) * ahead.radius - Math.sin(angle) * radius;
		const magnitude = Math.hypot(dx, dy) || 1;
		tangents[i3] = dx / magnitude;
		tangents[i3 + 1] = dy / magnitude;
		tangents[i3 + 2] = 0;
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
	geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
	geometry.setAttribute("aBlur", new THREE.BufferAttribute(blurs, 1));
	geometry.setAttribute("aT", new THREE.BufferAttribute(ts, 1));
	geometry.setAttribute("aTwinkle", new THREE.BufferAttribute(twinkles, 1));
	geometry.setAttribute("aOrbit", new THREE.BufferAttribute(orbits, 1));
	geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
	geometry.setAttribute("aTravel", new THREE.BufferAttribute(travels, 1));
	geometry.setAttribute("aScatter", new THREE.BufferAttribute(scatters, 3));
	geometry.setAttribute("aTangent", new THREE.BufferAttribute(tangents, 3));
	return geometry;
}

type BokehOptions = {
	/** Brightness the field keeps when the travelling light is far away. */
	ambient: number;
	/** Extra brightness picked up as the light passes. */
	starBrightness: number;
	driftDistance: number;
	driftSpeed: number;
	soft?: number;
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
			uSizeScale: { value: 1 },
			uSoft: { value: options.soft ?? 0 },
			uAmbient: { value: options.ambient },
			uStarBrightness: { value: options.starBrightness },
			uHead: { value: 1 },
			uKnots: { value: STAR_KNOTS },
			uLightReach: { value: LIGHT_REACH },
			uTrailLength: { value: TRAIL_LENGTH },
			uDriftSpeed: { value: options.driftSpeed },
			uDriftDistance: { value: options.driftDistance },
			uScatterSize: { value: new THREE.Vector2(80, 80) },
			uTilt: { value: INTRO_TILT },
		},
		vertexShader: BOKEH_VERTEX,
		fragmentShader: BOKEH_FRAGMENT,
	});
}

function createStarField(starCount: number): THREE.Points {
	const positions = new Float32Array(starCount * 3);
	const colors = new Float32Array(starCount * 3);
	const sizes = new Float32Array(starCount);

	for (let i = 0; i < starCount; i++) {
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
	/** 0 = fully faded, 1 = fully visible. Driven by hero scroll position. */
	scrollFade?: number;
};

export function SpaceBackground({
	onReplayReady,
	scrollFade = 1,
}: SpaceBackgroundProps) {
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

		const qualityTier = getQualityTier();
		const counts = PARTICLE_BUDGET[qualityTier];
		const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
		const rotationGain = coarsePointer ? 0.0075 : 0.005;

		const renderer = new THREE.WebGLRenderer({
			antialias: qualityTier !== "low",
			alpha: false,
			powerPreference: "high-performance",
		});
		renderer.setClearColor(0x01030a, 1);
		renderer.setPixelRatio(
			Math.min(window.devicePixelRatio, getPixelRatioCap(qualityTier)),
		);
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.domElement.style.width = "100%";
		renderer.domElement.style.height = "100%";
		renderer.domElement.style.display = "block";
		renderer.domElement.style.touchAction = "none";
		container.appendChild(renderer.domElement);

		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 600);
		camera.position.set(0, 0, 78);

		const stars = createStarField(counts.stars);
		scene.add(stars);

		const spiralGroup = new THREE.Group();
		spiralGroup.rotation.set(0.08, -0.06, -0.025);
		scene.add(spiralGroup);

		const dustGeometry = buildSpiralGeometry(counts.dust, "dust");
		const dustMaterial = createBokehMaterial(0.08, {
			ambient: 0.62,
			starBrightness: 0.45,
			driftDistance: 2.4,
			driftSpeed: 0.04,
			soft: 1,
		});
		const dust = new THREE.Points(dustGeometry, dustMaterial);
		dust.frustumCulled = false;
		spiralGroup.add(dust);

		const bulgeGeometry = buildSpiralGeometry(counts.bulge, "bulge");
		const bulgeMaterial = createBokehMaterial(0.7, {
			ambient: 1,
			starBrightness: 0,
			driftDistance: 0,
			driftSpeed: 0,
		});
		const bulge = new THREE.Points(bulgeGeometry, bulgeMaterial);
		bulge.frustumCulled = false;
		spiralGroup.add(bulge);

		const grainGeometry = buildSpiralGeometry(counts.grain, "grain");
		const grainMaterial = createBokehMaterial(1, {
			ambient: 0.7,
			starBrightness: 0.62,
			driftDistance: 1.1,
			driftSpeed: 0.04,
		});
		const grains = new THREE.Points(grainGeometry, grainMaterial);
		grains.frustumCulled = false;
		spiralGroup.add(grains);

		const halo = radialSprite(
			[
				[0, "rgba(255,236,214,0.085)"],
				[0.4, "rgba(214,206,206,0.03)"],
				[1, "rgba(200,200,210,0)"],
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
		let head = 1;
		let spin = 0;
		let targetRotationX = 0;
		let targetRotationY = 0;
		let currentRotationX = 0;
		let currentRotationY = 0;
		let isPointerDown = false;
		let lastPointerX = 0;
		let lastPointerY = 0;
		let pointerMoved = false;
		let isVisible = !document.hidden;
		const reducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;

		replayRef.current = () => {
			formationStart = performance.now();
			head = 1;
			targetRotationX = 0;
			targetRotationY = 0;
		};

		const onPointerDown = (event: PointerEvent) => {
			if (!event.isPrimary || event.button !== 0) return;
			isPointerDown = true;
			pointerMoved = false;
			lastPointerX = event.clientX;
			lastPointerY = event.clientY;
			setIsDragging(true);
			renderer.domElement.setPointerCapture(event.pointerId);
		};

		const onPointerMove = (event: PointerEvent) => {
			if (!isPointerDown || !event.isPrimary) return;
			const dx = event.clientX - lastPointerX;
			const dy = event.clientY - lastPointerY;
			if (!pointerMoved && Math.hypot(dx, dy) < 6) return;
			pointerMoved = true;
			targetRotationY += dx * rotationGain;
			targetRotationX += dy * rotationGain;
			lastPointerX = event.clientX;
			lastPointerY = event.clientY;
		};

		const onPointerUp = (event: PointerEvent) => {
			if (!isPointerDown) return;
			isPointerDown = false;
			pointerMoved = false;
			setIsDragging(false);
			if (renderer.domElement.hasPointerCapture(event.pointerId)) {
				renderer.domElement.releasePointerCapture(event.pointerId);
			}
		};

		const onVisibilityChange = () => {
			isVisible = !document.hidden;
			if (isVisible) clock.getDelta();
		};

		const onKeyDown = (event: KeyboardEvent) => {
			if (!event.key.startsWith("Arrow")) return;
			event.preventDefault();
			if (event.key === "ArrowLeft") targetRotationY -= 0.08;
			if (event.key === "ArrowRight") targetRotationY += 0.08;
			if (event.key === "ArrowUp") targetRotationX -= 0.08;
			if (event.key === "ArrowDown") targetRotationX += 0.08;
		};

		renderer.domElement.addEventListener("pointerdown", onPointerDown);
		renderer.domElement.addEventListener("pointermove", onPointerMove);
		renderer.domElement.addEventListener("pointerup", onPointerUp);
		renderer.domElement.addEventListener("pointercancel", onPointerUp);
		window.addEventListener("keydown", onKeyDown);
		document.addEventListener("visibilitychange", onVisibilityChange);

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

			// Particles start scattered across the whole frame, so the box the
			// intro draws them from has to track the visible area.
			const visibleHeight =
				2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
			for (const material of [grainMaterial, dustMaterial, bulgeMaterial]) {
				material.uniforms.uScatterSize.value.set(
					visibleHeight * camera.aspect,
					visibleHeight,
				);
			}

			// Keep the spiral centered and proportionally framed on all viewports.
			const widthFit = width / 1100;
			const heightFit = height / 700;
			const fit = Math.min(1, Math.max(0.68, Math.min(widthFit, heightFit)));
			spiralGroup.scale.setScalar(fit);
		};

		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(container);

		const clock = new THREE.Clock();
		let rafId = 0;

		const animate = () => {
			rafId = window.requestAnimationFrame(animate);
			if (!isVisible) return;
			const delta = Math.min(clock.getDelta(), 0.05);
			const t = clock.elapsedTime;
			const introElapsed = (performance.now() - formationStart) / 1000;
			const formation = reducedMotion
				? 1
				: Math.min(
						1,
						Math.max(0, introElapsed - INTRO_DELAY) / INTRO_DURATION,
					);

			// The light runs from the rim toward the core, wrapping around.
			head = (head - delta * FLOW_SPEED + 1) % 1;

			for (const material of [grainMaterial, dustMaterial, bulgeMaterial]) {
				material.uniforms.uTime.value = t;
				material.uniforms.uFormation.value = formation;
				material.uniforms.uHead.value = head;
			}

			if (!isPointerDown) {
				const returnAmount = 1 - Math.exp(-RETURN_SPRING * delta);
				targetRotationX += (0 - targetRotationX) * returnAmount;
				targetRotationY += (0 - targetRotationY) * returnAmount;
			}
			const followAmount = 1 - Math.exp(-FOLLOW_DAMPING * delta);
			currentRotationX +=
				(targetRotationX - currentRotationX) * followAmount;
			currentRotationY +=
				(targetRotationY - currentRotationY) * followAmount;
			// The field never comes to rest: it keeps turning about its axis with a
			// slow wobble, so the arms drift past the frame after they have formed.
			if (!reducedMotion) spin = (spin + delta * SPIN_SPEED) % (Math.PI * 2);
			const wobbleX = reducedMotion ? 0 : 0.08 * Math.sin(t * 0.22);
			const wobbleY = reducedMotion ? 0 : 0.14 * Math.cos(t * 0.28);
			spiralGroup.rotation.x = 0.08 + wobbleX + currentRotationX;
			spiralGroup.rotation.y = -0.06 + wobbleY + currentRotationY;
			spiralGroup.rotation.z = -0.025 + spin;

			(core.material as THREE.SpriteMaterial).opacity = formation ** 2 * 0.8;
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
			document.removeEventListener("visibilitychange", onVisibilityChange);

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
			className={`absolute inset-0 z-0 transition-opacity duration-500 ease-out ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
			style={{ opacity: scrollFade }}
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

