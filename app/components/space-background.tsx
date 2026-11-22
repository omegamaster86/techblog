"use client";

import { useEffect, useRef } from "react";

type Point = { x: number; y: number };
type Rgb = [number, number, number];

type RibbonGeometry = {
	p0: Point;
	p1: Point;
	p2: Point;
	p3: Point;
};

type RibbonParticle = {
	ribbon: "sol" | "astra";
	layer: "bokeh" | "mid" | "spark";
	tBase: number;
	tSpeed: number;
	normalBase: number;
	waveAmp: number;
	waveFreq: number;
	wavePhase: number;
	size: number;
	baseAlpha: number;
	twinklePhase: number;
	twinkleSpeed: number;
	hot: boolean;
};

type FlowingFlare = {
	ribbon: "sol" | "astra";
	tBase: number;
	tSpeed: number;
	normalFactor: number;
	size: number;
	baseAlpha: number;
	phase: number;
	twinkleSpeed: number;
	includeDiagonal: boolean;
};

type TwinkleStar = {
	x: number;
	y: number;
	r: number;
	baseAlpha: number;
	phase: number;
	speed: number;
	driftX: number;
	driftY: number;
	warm: boolean;
};

type SpriteSet = {
	coolBokeh: HTMLCanvasElement;
	midGoldBokeh: HTMLCanvasElement;
	warmBokeh: HTMLCanvasElement;
	coolBead: HTMLCanvasElement;
	warmBead: HTMLCanvasElement;
	hotWhite: HTMLCanvasElement;
};

function mulberry32(seed: number) {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function gaussianRandom(rand: () => number) {
	const u = Math.max(1e-6, rand());
	const v = rand();
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function lerp(a: number, b: number, t: number) {
	return a + (b - a) * t;
}

function lerpColor(c1: Rgb, c2: Rgb, t: number): Rgb {
	return [
		Math.round(lerp(c1[0], c2[0], t)),
		Math.round(lerp(c1[1], c2[1], t)),
		Math.round(lerp(c1[2], c2[2], t)),
	];
}

function bezierPoint(g: RibbonGeometry, t: number): Point {
	const u = 1 - t;
	const tt = t * t;
	const uu = u * u;
	return {
		x:
			uu * u * g.p0.x +
			3 * uu * t * g.p1.x +
			3 * u * tt * g.p2.x +
			tt * t * g.p3.x,
		y:
			uu * u * g.p0.y +
			3 * uu * t * g.p1.y +
			3 * u * tt * g.p2.y +
			tt * t * g.p3.y,
	};
}

function bezierTangent(g: RibbonGeometry, t: number): Point {
	const u = 1 - t;
	const dx =
		3 * u * u * (g.p1.x - g.p0.x) +
		6 * u * t * (g.p2.x - g.p1.x) +
		3 * t * t * (g.p3.x - g.p2.x);
	const dy =
		3 * u * u * (g.p1.y - g.p0.y) +
		6 * u * t * (g.p2.y - g.p1.y) +
		3 * t * t * (g.p3.y - g.p2.y);
	const len = Math.hypot(dx, dy) || 1;
	return { x: dx / len, y: dy / len };
}

function createRadialSprite(
	size: number,
	stops: Array<[number, string]>,
): HTMLCanvasElement {
	const c = document.createElement("canvas");
	c.width = size;
	c.height = size;
	const sctx = c.getContext("2d");
	if (!sctx) return c;
	const half = size / 2;
	const grad = sctx.createRadialGradient(half, half, 0, half, half, half);
	for (const [offset, color] of stops) {
		grad.addColorStop(offset, color);
	}
	sctx.fillStyle = grad;
	sctx.fillRect(0, 0, size, size);
	return c;
}

function buildSprites(): SpriteSet {
	return {
		coolBokeh: createRadialSprite(48, [
			[0, "rgba(86, 136, 206, 0.95)"],
			[0.65, "rgba(64, 108, 174, 0.62)"],
			[1, "rgba(64, 108, 174, 0)"],
		]),
		midGoldBokeh: createRadialSprite(48, [
			[0, "rgba(182, 146, 108, 0.92)"],
			[0.65, "rgba(148, 114, 78, 0.56)"],
			[1, "rgba(148, 114, 78, 0)"],
		]),
		warmBokeh: createRadialSprite(48, [
			[0, "rgba(206, 146, 84, 0.95)"],
			[0.65, "rgba(174, 118, 64, 0.60)"],
			[1, "rgba(174, 118, 64, 0)"],
		]),
		coolBead: createRadialSprite(32, [
			[0, "rgba(255, 255, 255, 1)"],
			[0.32, "rgba(186, 224, 255, 0.92)"],
			[0.68, "rgba(104, 166, 238, 0.36)"],
			[1, "rgba(104, 166, 238, 0)"],
		]),
		warmBead: createRadialSprite(32, [
			[0, "rgba(255, 252, 244, 1)"],
			[0.34, "rgba(255, 218, 158, 0.92)"],
			[0.68, "rgba(232, 164, 92, 0.36)"],
			[1, "rgba(232, 164, 92, 0)"],
		]),
		hotWhite: createRadialSprite(32, [
			[0, "rgba(255, 255, 255, 1)"],
			[0.42, "rgba(245, 250, 255, 0.88)"],
			[0.76, "rgba(210, 230, 255, 0.24)"],
			[1, "rgba(210, 230, 255, 0)"],
		]),
	};
}

function drawFourPointStar(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	size: number,
	coreRadius: number,
	tint: Rgb,
	alpha: number,
	includeDiagonal: boolean,
	diagonalRotation = 0,
) {
	if (alpha < 0.02 || size < 1) return;
	ctx.save();
	ctx.globalCompositeOperation = "lighter";

	const aura = ctx.createRadialGradient(x, y, 0, x, y, size * 0.44);
	aura.addColorStop(0, `rgba(255,255,255,${0.94 * alpha})`);
	aura.addColorStop(
		0.2,
		`rgba(${tint[0]},${tint[1]},${tint[2]},${0.54 * alpha})`,
	);
	aura.addColorStop(
		0.56,
		`rgba(${tint[0]},${tint[1]},${tint[2]},${0.13 * alpha})`,
	);
	aura.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = aura;
	ctx.beginPath();
	ctx.arc(x, y, size * 0.44, 0, Math.PI * 2);
	ctx.fill();

	const drawSpike = (
		angle: number,
		length: number,
		halfWidth: number,
		op: number,
	) => {
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(angle);
		const grad = ctx.createLinearGradient(-length, 0, length, 0);
		grad.addColorStop(0, "rgba(255,255,255,0)");
		grad.addColorStop(
			0.3,
			`rgba(${tint[0]},${tint[1]},${tint[2]},${0.35 * op})`,
		);
		grad.addColorStop(0.5, `rgba(255,255,255,${0.98 * op})`);
		grad.addColorStop(
			0.7,
			`rgba(${tint[0]},${tint[1]},${tint[2]},${0.35 * op})`,
		);
		grad.addColorStop(1, "rgba(255,255,255,0)");
		ctx.fillStyle = grad;
		ctx.beginPath();
		ctx.moveTo(-length, 0);
		ctx.quadraticCurveTo(0, -halfWidth, length, 0);
		ctx.quadraticCurveTo(0, halfWidth, -length, 0);
		ctx.fill();
		ctx.restore();
	};

	drawSpike(0, size, Math.max(0.75, size * 0.027), alpha);
	drawSpike(Math.PI / 2, size * 0.96, Math.max(0.75, size * 0.027), alpha);

	if (includeDiagonal) {
		drawSpike(
			Math.PI / 4 + diagonalRotation,
			size * 0.28,
			Math.max(0.55, size * 0.02),
			alpha * 0.56,
		);
		drawSpike(
			-Math.PI / 4 + diagonalRotation,
			size * 0.28,
			Math.max(0.55, size * 0.02),
			alpha * 0.56,
		);
	}

	const core = ctx.createRadialGradient(x, y, 0, x, y, coreRadius);
	core.addColorStop(0, `rgba(255,255,255,${alpha})`);
	core.addColorStop(0.55, `rgba(255,255,255,${0.88 * alpha})`);
	core.addColorStop(1, "rgba(255,255,255,0)");
	ctx.fillStyle = core;
	ctx.beginPath();
	ctx.arc(x, y, coreRadius, 0, Math.PI * 2);
	ctx.fill();

	ctx.restore();
}

function drawSolOrb(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	radius: number,
	pulse: number,
	shimmer: number,
) {
	ctx.save();
	ctx.globalCompositeOperation = "screen";

	const outerR = radius * (3.85 + pulse * 0.85);
	const halo3 = ctx.createRadialGradient(x, y, radius * 0.6, x, y, outerR);
	halo3.addColorStop(0, `rgba(255, 208, 136, ${0.56 + pulse * 0.18})`);
	halo3.addColorStop(0.26, `rgba(226, 150, 80, ${0.3 + pulse * 0.14})`);
	halo3.addColorStop(0.58, `rgba(132, 74, 42, ${0.1 + pulse * 0.06})`);
	halo3.addColorStop(1, "rgba(0, 0, 0, 0)");
	ctx.fillStyle = halo3;
	ctx.beginPath();
	ctx.arc(x, y, outerR, 0, Math.PI * 2);
	ctx.fill();

	const midR = radius * (1.72 + pulse * 0.34);
	const halo2 = ctx.createRadialGradient(x, y, radius * 0.8, x, y, midR);
	halo2.addColorStop(0, "rgba(255, 248, 230, 0.98)");
	halo2.addColorStop(0.32, `rgba(255, 208, 140, ${0.72 + shimmer * 0.18})`);
	halo2.addColorStop(0.68, `rgba(220, 144, 74, ${0.22 + pulse * 0.14})`);
	halo2.addColorStop(1, "rgba(0, 0, 0, 0)");
	ctx.fillStyle = halo2;
	ctx.beginPath();
	ctx.arc(x, y, midR, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();

	const discR = radius * (1.03 + pulse * 0.035);
	ctx.save();
	const disc = ctx.createRadialGradient(
		x - radius * 0.1,
		y - radius * 0.1,
		0,
		x,
		y,
		discR,
	);
	disc.addColorStop(0, "#ffffff");
	disc.addColorStop(0.75, "#fffbf2");
	disc.addColorStop(0.92, "#ffe0ab");
	disc.addColorStop(1, "rgba(255, 198, 124, 0)");
	ctx.fillStyle = disc;
	ctx.beginPath();
	ctx.arc(x, y, discR, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

export function SpaceBackground() {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	useEffect(() => {
		const container = containerRef.current;
		const canvas = canvasRef.current;
		if (!container || !canvas) return;

		const ctx = canvas.getContext("2d", { alpha: false });
		if (!ctx) return;

		const reducedMotionQuery = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		);

		const staticCanvas = document.createElement("canvas");
		const staticCtx = staticCanvas.getContext("2d", { alpha: false });
		if (!staticCtx) return;

		const sprites = buildSprites();

		let width = 1;
		let height = 1;
		let dpr = 1;
		let scale = 1;
		let solGeometry: RibbonGeometry = {
			p0: { x: 0, y: 0 },
			p1: { x: 0, y: 0 },
			p2: { x: 0, y: 0 },
			p3: { x: 0, y: 0 },
		};
		let astraGeometry: RibbonGeometry = {
			p0: { x: 0, y: 0 },
			p1: { x: 0, y: 0 },
			p2: { x: 0, y: 0 },
			p3: { x: 0, y: 0 },
		};
		let solRadius = 38;
		let astraStarSize = 102;
		let stars: TwinkleStar[] = [];
		let particles: RibbonParticle[] = [];
		let flares: FlowingFlare[] = [];

		// Pointer attraction/repulsion state inspired by the OpenAI Astra/Sol hero
		const pointer = {
			active: false,
			x: 0,
			y: 0,
			smoothX: 0,
			smoothY: 0,
			strength: 0,
		};

		const solWidth = (t: number) => {
			const belly = Math.sin(t ** 0.78 * Math.PI);
			return (lerp(34, 8, t ** 1.5) + belly * 12) * scale;
		};

		const astraWidth = (t: number) => (5 + t ** 0.85 * 45) * scale;

		const buildScene = () => {
			width = Math.max(1, container.clientWidth);
			height = Math.max(1, container.clientHeight);
			dpr = Math.min(window.devicePixelRatio || 1, 2);
			scale = Math.max(
				0.55,
				Math.min(1.25, Math.min(width / 1360, height / 980)),
			);

			canvas.width = Math.round(width * dpr);
			canvas.height = Math.round(height * dpr);
			staticCanvas.width = canvas.width;
			staticCanvas.height = canvas.height;

			staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

			const rand = mulberry32(20261124);
			const isCompact = width < 768;

			solGeometry = isCompact
				? {
						p0: { x: -width * 0.06, y: height * 0.17 },
						p1: { x: width * 0.25, y: -height * 0.01 },
						p2: { x: width * 0.66, y: height * 0.01 },
						p3: { x: width * 0.88, y: height * 0.12 },
					}
				: {
						p0: { x: -width * 0.02, y: height * 0.23 },
						p1: { x: width * 0.24, y: -height * 0.015 },
						p2: { x: width * 0.68, y: -height * 0.01 },
						p3: { x: width * 0.912, y: height * 0.175 },
					};

			astraGeometry = isCompact
				? {
						p0: { x: width * 0.2, y: height * 0.84 },
						p1: { x: width * 0.44, y: height * 0.96 },
						p2: { x: width * 0.76, y: height * 0.93 },
						p3: { x: width * 1.04, y: height * 0.74 },
					}
				: {
						p0: { x: width * 0.375, y: height * 0.805 },
						p1: { x: width * 0.53, y: height * 0.955 },
						p2: { x: width * 0.79, y: height * 0.935 },
						p3: { x: width * 1.02, y: height * 0.665 },
					};

			solRadius = 38 * scale;
			astraStarSize = 102 * scale;

			// 1. Static midnight navy backdrop + subtle blooms + blurred spine glows
			const bgGrad = staticCtx.createLinearGradient(0, 0, 0, height);
			bgGrad.addColorStop(0, "#0c1427");
			bgGrad.addColorStop(0.38, "#070b1b");
			bgGrad.addColorStop(0.75, "#0b1428");
			bgGrad.addColorStop(1, "#142139");
			staticCtx.fillStyle = bgGrad;
			staticCtx.fillRect(0, 0, width, height);

			const centerVignette = staticCtx.createRadialGradient(
				width * 0.48,
				height * 0.44,
				width * 0.06,
				width * 0.48,
				height * 0.44,
				width * 0.62,
			);
			centerVignette.addColorStop(0, "rgba(5, 8, 22, 0.45)");
			centerVignette.addColorStop(1, "rgba(18, 32, 58, 0)");
			staticCtx.fillStyle = centerVignette;
			staticCtx.fillRect(0, 0, width, height);

			staticCtx.save();
			staticCtx.globalCompositeOperation = "screen";
			const solAmb = staticCtx.createRadialGradient(
				solGeometry.p3.x,
				solGeometry.p3.y,
				6 * scale,
				solGeometry.p3.x,
				solGeometry.p3.y,
				width * 0.24,
			);
			solAmb.addColorStop(0, "rgba(255, 206, 138, 0.36)");
			solAmb.addColorStop(0.24, "rgba(216, 146, 82, 0.17)");
			solAmb.addColorStop(0.58, "rgba(112, 68, 42, 0.06)");
			solAmb.addColorStop(1, "rgba(0, 0, 0, 0)");
			staticCtx.fillStyle = solAmb;
			staticCtx.fillRect(0, 0, width, height);

			const astraAmb = staticCtx.createRadialGradient(
				width * 0.66,
				height * 0.86,
				10 * scale,
				width * 0.66,
				height * 0.86,
				width * 0.36,
			);
			astraAmb.addColorStop(0, "rgba(88, 148, 228, 0.16)");
			astraAmb.addColorStop(0.45, "rgba(40, 82, 150, 0.08)");
			astraAmb.addColorStop(1, "rgba(0, 0, 0, 0)");
			staticCtx.fillStyle = astraAmb;
			staticCtx.fillRect(0, 0, width, height);
			staticCtx.restore();

			const drawRibbonGlow = (
				g: RibbonGeometry,
				startColor: string,
				midColor: string,
				endColor: string,
				lineWidth: number,
			) => {
				staticCtx.save();
				staticCtx.globalCompositeOperation = "screen";
				staticCtx.lineCap = "round";
				const grad = staticCtx.createLinearGradient(
					g.p0.x,
					g.p0.y,
					g.p3.x,
					g.p3.y,
				);
				grad.addColorStop(0, startColor);
				grad.addColorStop(0.5, midColor);
				grad.addColorStop(1, endColor);
				staticCtx.strokeStyle = grad;
				staticCtx.lineWidth = lineWidth;
				staticCtx.filter = `blur(${Math.round(13 * scale)}px)`;
				staticCtx.beginPath();
				staticCtx.moveTo(g.p0.x, g.p0.y);
				staticCtx.bezierCurveTo(g.p1.x, g.p1.y, g.p2.x, g.p2.y, g.p3.x, g.p3.y);
				staticCtx.stroke();
				staticCtx.restore();
			};

			drawRibbonGlow(
				solGeometry,
				"rgba(118, 162, 220, 0.12)",
				"rgba(232, 190, 134, 0.18)",
				"rgba(255, 192, 118, 0.28)",
				38 * scale,
			);
			drawRibbonGlow(
				astraGeometry,
				"rgba(195, 228, 255, 0.22)",
				"rgba(96, 155, 230, 0.16)",
				"rgba(70, 128, 210, 0.15)",
				41 * scale,
			);

			// 2. Distant twinkling background stars (with subtle slow drift)
			stars = [];
			for (let i = 0; i < 80; i++) {
				stars.push({
					x: rand() * width,
					y: rand() * height,
					r: (0.55 + rand() * 0.95) * scale,
					baseAlpha: 0.22 + rand() * 0.55,
					phase: rand() * Math.PI * 2,
					speed: 1.0 + rand() * 2.0,
					driftX: (rand() - 0.5) * 2.4,
					driftY: (rand() - 0.5) * 1.8,
					warm: rand() > 0.72,
				});
			}

			// 3. Live layered streaming stardust particles along both trajectories
			particles = [];
			const density = isCompact ? 0.62 : 1;

			const addRibbonParticles = (
				ribbon: "sol" | "astra",
				bokehCount: number,
				midCount: number,
				sparkCount: number,
			) => {
				// Far/deep bokeh layer (stately visible glide)
				for (let i = 0; i < bokehCount; i++) {
					particles.push({
						ribbon,
						layer: "bokeh",
						tBase: rand(),
						tSpeed: 0.022 + rand() * 0.024,
						normalBase: gaussianRandom(rand) * 0.58,
						waveAmp: (0.04 + rand() * 0.08) * (rand() < 0.5 ? 1 : -1),
						waveFreq: 5 + rand() * 4,
						wavePhase: rand() * Math.PI * 2,
						size: (3.6 + rand() * 7.2) * scale,
						baseAlpha: 0.18 + rand() * 0.28,
						twinklePhase: rand() * Math.PI * 2,
						twinkleSpeed: 0.9 + rand() * 1.3,
						hot: false,
					});
				}

				// Mid stardust beads (fluid continuous stream)
				for (let i = 0; i < midCount; i++) {
					particles.push({
						ribbon,
						layer: "mid",
						tBase: rand(),
						tSpeed: 0.045 + rand() * 0.055,
						normalBase: gaussianRandom(rand) * (rand() < 0.72 ? 0.36 : 0.72),
						waveAmp: (0.05 + rand() * 0.11) * (rand() < 0.5 ? 1 : -1),
						waveFreq: 6 + rand() * 5,
						wavePhase: rand() * Math.PI * 2,
						size: (2.6 + rand() * 4.2) * scale,
						baseAlpha: 0.34 + rand() * 0.58,
						twinklePhase: rand() * Math.PI * 2,
						twinkleSpeed: 1.6 + rand() * 2.4,
						hot: rand() > 0.72,
					});
				}

				// Near bright sparks (energetic luminous stream)
				for (let i = 0; i < sparkCount; i++) {
					particles.push({
						ribbon,
						layer: "spark",
						tBase: rand(),
						tSpeed: 0.085 + rand() * 0.075,
						normalBase: gaussianRandom(rand) * 0.32,
						waveAmp: (0.06 + rand() * 0.12) * (rand() < 0.5 ? 1 : -1),
						waveFreq: 7 + rand() * 5,
						wavePhase: rand() * Math.PI * 2,
						size: (5.2 + rand() * 5.4) * scale,
						baseAlpha: 0.55 + rand() * 0.45,
						twinklePhase: rand() * Math.PI * 2,
						twinkleSpeed: 2.2 + rand() * 2.8,
						hot: rand() > 0.35,
					});
				}
			};

			addRibbonParticles(
				"sol",
				Math.round(230 * density),
				Math.round(520 * density),
				Math.round(95 * density),
			);
			addRibbonParticles(
				"astra",
				Math.round(210 * density),
				Math.round(470 * density),
				Math.round(90 * density),
			);

			// 4. Flowing 4-point specular flares riding smoothly along both arcs
			flares = [];
			const solFlareCount = isCompact ? 7 : 10;
			for (let i = 0; i < solFlareCount; i++) {
				const baseSize = (15 + rand() * 14) * scale;
				flares.push({
					ribbon: "sol",
					tBase: (i + rand() * 0.45) / solFlareCount,
					tSpeed: 0.055 + rand() * 0.04,
					normalFactor: (rand() - 0.5) * 0.28,
					size: baseSize,
					baseAlpha: 0.78 + rand() * 0.22,
					phase: rand() * Math.PI * 2,
					twinkleSpeed: 2.0 + rand() * 1.8,
					includeDiagonal: baseSize > 20 * scale,
				});
			}

			const astraFlareCount = isCompact ? 6 : 9;
			for (let i = 0; i < astraFlareCount; i++) {
				const baseSize = (15 + rand() * 16) * scale;
				flares.push({
					ribbon: "astra",
					tBase: (i + rand() * 0.45) / astraFlareCount,
					tSpeed: 0.055 + rand() * 0.04,
					normalFactor: (rand() - 0.5) * 0.3,
					size: baseSize,
					baseAlpha: 0.78 + rand() * 0.22,
					phase: rand() * Math.PI * 2,
					twinkleSpeed: 2.0 + rand() * 1.8,
					includeDiagonal: baseSize > 20 * scale,
				});
			}
		};

		const applyPointerField = (x: number, y: number, radiusPx: number) => {
			if (pointer.strength <= 0.01) return { x, y };
			const dx = x - pointer.smoothX;
			const dy = y - pointer.smoothY;
			const distSq = dx * dx + dy * dy;
			const maxDistSq = radiusPx * radiusPx;
			if (distSq >= maxDistSq || distSq < 0.001) return { x, y };

			const dist = Math.sqrt(distSq);
			const norm = 1 - dist / radiusPx;
			const nx = dx / dist;
			const ny = dy / dist;

			// Inner soft repulsion + outer subtle attraction & orbital swirl
			const radialForce =
				(dist < radiusPx * 0.48 ? norm * 24 : -norm * 10) * pointer.strength;
			const swirlForce = norm * norm * 14 * pointer.strength;

			return {
				x: x + nx * radialForce - ny * swirlForce,
				y: y + ny * radialForce + nx * swirlForce,
			};
		};

		const renderFrame = (elapsedSec: number) => {
			// Smooth pointer inertia
			if (pointer.active) {
				pointer.smoothX += (pointer.x - pointer.smoothX) * 0.12;
				pointer.smoothY += (pointer.y - pointer.smoothY) * 0.12;
				pointer.strength += (1 - pointer.strength) * 0.1;
			} else {
				pointer.strength *= 0.92;
			}

			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.drawImage(staticCanvas, 0, 0);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

			// 1. Twinkling background starfield with gentle slow drift
			for (const s of stars) {
				const sx = (s.x + elapsedSec * s.driftX + width) % width;
				const sy = (s.y + elapsedSec * s.driftY + height) % height;
				const tw =
					0.35 + 0.65 * (0.5 + 0.5 * Math.sin(elapsedSec * s.speed + s.phase));
				const alpha = s.baseAlpha * tw;
				ctx.fillStyle = s.warm
					? `rgba(255, 238, 210, ${alpha})`
					: `rgba(210, 228, 255, ${alpha})`;
				ctx.beginPath();
				ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
				ctx.fill();
			}

			const pointerRadius = 180 * scale;

			// 2. Bokeh layer (normal blending for photographic depth)
			ctx.save();
			ctx.globalCompositeOperation = "source-over";
			for (const p of particles) {
				if (p.layer !== "bokeh") continue;
				const t = (p.tBase + elapsedSec * p.tSpeed) % 1;
				const g = p.ribbon === "sol" ? solGeometry : astraGeometry;
				const w = p.ribbon === "sol" ? solWidth(t) : astraWidth(t);
				const pt = bezierPoint(g, t);
				const tan = bezierTangent(g, t);
				const wave =
					Math.sin(t * p.waveFreq - elapsedSec * 1.15 + p.wavePhase) *
					p.waveAmp;
				const offset = (p.normalBase + wave) * w;
				const rawX = pt.x - tan.y * offset;
				const rawY = pt.y + tan.x * offset;
				const pos = applyPointerField(rawX, rawY, pointerRadius);

				const distNorm = Math.min(1, Math.abs(offset) / (w * 1.15));
				const endFade =
					p.ribbon === "sol"
						? Math.min(1, t * 7, (1 - t) * 14)
						: Math.min(1, t * 14, (1 - t) * 7);
				const tw =
					0.72 + 0.28 * Math.sin(elapsedSec * p.twinkleSpeed + p.twinklePhase);
				const alpha = p.baseAlpha * tw * (1 - distNorm * 0.55) * endFade;
				if (alpha < 0.02) continue;

				let sprite = sprites.coolBokeh;
				if (p.ribbon === "sol") {
					if (t > 0.56) sprite = sprites.warmBokeh;
					else if (t > 0.28) sprite = sprites.midGoldBokeh;
				}
				const drawSize = p.size * (1 - distNorm * 0.3);
				ctx.globalAlpha = alpha;
				ctx.drawImage(
					sprite,
					pos.x - drawSize * 0.5,
					pos.y - drawSize * 0.5,
					drawSize,
					drawSize,
				);
			}
			ctx.restore();

			// 3. Mid beads & near glowing sparks (additive blending for crisp stardust luminance)
			ctx.save();
			ctx.globalCompositeOperation = "lighter";
			for (const p of particles) {
				if (p.layer === "bokeh") continue;
				const t = (p.tBase + elapsedSec * p.tSpeed) % 1;
				const g = p.ribbon === "sol" ? solGeometry : astraGeometry;
				const w = p.ribbon === "sol" ? solWidth(t) : astraWidth(t);
				const pt = bezierPoint(g, t);
				const tan = bezierTangent(g, t);
				const wave =
					Math.sin(t * p.waveFreq - elapsedSec * 1.6 + p.wavePhase) * p.waveAmp;
				const offset = (p.normalBase + wave) * w;
				const rawX = pt.x - tan.y * offset;
				const rawY = pt.y + tan.x * offset;
				const pos = applyPointerField(rawX, rawY, pointerRadius);

				const distNorm = Math.min(1, Math.abs(offset) / (w * 1.15));
				const endFade =
					p.ribbon === "sol"
						? Math.min(1, t * 6, (1 - t) * 16)
						: Math.min(1, t * 18, (1 - t) * 6);
				const twWave =
					0.5 + 0.5 * Math.sin(elapsedSec * p.twinkleSpeed + p.twinklePhase);
				const tw =
					p.layer === "spark" ? 0.3 + 0.7 * twWave : 0.45 + 0.55 * twWave;
				const alpha = Math.min(
					1,
					p.baseAlpha * tw * (1 - distNorm * 0.5) * endFade,
				);
				if (alpha < 0.03) continue;

				let sprite: HTMLCanvasElement;
				if (p.hot && twWave > 0.65) {
					sprite = sprites.hotWhite;
				} else if (p.ribbon === "sol") {
					sprite = t > 0.34 ? sprites.warmBead : sprites.coolBead;
				} else {
					sprite = sprites.coolBead;
				}

				const drawSize =
					p.size *
					(p.layer === "spark" ? 0.8 + 0.38 * twWave : 0.85 + 0.25 * twWave);
				ctx.globalAlpha = alpha;
				ctx.drawImage(
					sprite,
					pos.x - drawSize * 0.5,
					pos.y - drawSize * 0.5,
					drawSize,
					drawSize,
				);
			}
			ctx.restore();

			// 4. Flowing 4-point specular star glints riding smoothly along both curves
			for (const f of flares) {
				const t = (f.tBase + elapsedSec * f.tSpeed) % 1;
				const g = f.ribbon === "sol" ? solGeometry : astraGeometry;
				const w = f.ribbon === "sol" ? solWidth(t) : astraWidth(t);
				const pt = bezierPoint(g, t);
				const tan = bezierTangent(g, t);
				const rawX = pt.x - tan.y * (f.normalFactor * w);
				const rawY = pt.y + tan.x * (f.normalFactor * w);
				const pos = applyPointerField(rawX, rawY, pointerRadius);

				const endFade = Math.min(1, t * 7, (1 - t) * 7);
				const pulse =
					0.5 + 0.5 * Math.sin(elapsedSec * f.twinkleSpeed + f.phase);
				const alpha = f.baseAlpha * (0.42 + 0.58 * pulse) * endFade;
				const tint: Rgb =
					f.ribbon === "sol"
						? lerpColor([195, 224, 255], [255, 206, 132], Math.min(1, t * 1.25))
						: [166, 212, 255];

				drawFourPointStar(
					ctx,
					pos.x,
					pos.y,
					f.size * (0.76 + 0.4 * pulse),
					f.size * 0.14,
					tint,
					alpha,
					f.includeDiagonal,
					Math.sin(elapsedSec * 0.8 + f.phase) * 0.08,
				);
			}

			// 5. Sol radiant solar orb (visible breathing corona + subtle orbital float + pointer lean)
			const solPulse = 0.5 + 0.5 * Math.sin(elapsedSec * 1.35);
			const solShimmer = 0.5 + 0.5 * Math.sin(elapsedSec * 2.6 + 0.8);
			const solFloatX = Math.cos(elapsedSec * 0.55) * 3.5 * scale;
			const solFloatY = Math.sin(elapsedSec * 0.8) * 3.0 * scale;
			let solX = solGeometry.p3.x + solFloatX;
			let solY = solGeometry.p3.y + solFloatY;
			if (pointer.strength > 0.01) {
				const dx = pointer.smoothX - solX;
				const dy = pointer.smoothY - solY;
				const dist = Math.hypot(dx, dy) || 1;
				const pull =
					Math.min(14 * scale, 1800 / (dist + 120)) * pointer.strength;
				solX += (dx / dist) * pull;
				solY += (dy / dist) * pull;
			}
			drawSolOrb(ctx, solX, solY, solRadius, solPulse, solShimmer);

			// 6. Astra 4-point star (clear breathing diffraction spikes + gentle shimmer)
			const astraPulse =
				0.84 +
				0.22 * (0.5 + 0.5 * Math.sin(elapsedSec * 1.7 + 0.9)) +
				0.08 * Math.sin(elapsedSec * 3.4);
			const astraDiagRot = Math.sin(elapsedSec * 0.75) * 0.12;
			let astraX =
				astraGeometry.p0.x + Math.sin(elapsedSec * 0.6) * 2.2 * scale;
			let astraY =
				astraGeometry.p0.y + Math.cos(elapsedSec * 0.75) * 2.0 * scale;
			if (pointer.strength > 0.01) {
				const dx = pointer.smoothX - astraX;
				const dy = pointer.smoothY - astraY;
				const dist = Math.hypot(dx, dy) || 1;
				const pull =
					Math.min(10 * scale, 1400 / (dist + 140)) * pointer.strength;
				astraX += (dx / dist) * pull;
				astraY += (dy / dist) * pull;
			}
			drawFourPointStar(
				ctx,
				astraX,
				astraY,
				astraStarSize * astraPulse,
				9.5 * scale * (0.94 + 0.12 * solShimmer),
				[175, 218, 255],
				1,
				true,
				astraDiagRot,
			);
		};

		let rafId = 0;
		let elapsedAccSec = 0;
		let lastFrameMs = 0;

		const stopLoop = () => {
			if (rafId) {
				window.cancelAnimationFrame(rafId);
				rafId = 0;
			}
		};

		const tick = (now: number) => {
			if (lastFrameMs > 0) {
				const dtSec = Math.min(0.1, (now - lastFrameMs) * 0.001);
				elapsedAccSec += dtSec;
			}
			lastFrameMs = now;
			renderFrame(elapsedAccSec);
			rafId = window.requestAnimationFrame(tick);
		};

		const syncPlayback = () => {
			stopLoop();
			if (reducedMotionQuery.matches) {
				renderFrame(0);
				return;
			}
			if (document.hidden) {
				return;
			}
			lastFrameMs = performance.now();
			rafId = window.requestAnimationFrame(tick);
		};

		const handleResize = () => {
			buildScene();
			renderFrame(reducedMotionQuery.matches ? 0 : elapsedAccSec);
		};

		const handlePointerMove = (e: PointerEvent) => {
			if (reducedMotionQuery.matches) return;
			const rect = container.getBoundingClientRect();
			pointer.x = e.clientX - rect.left;
			pointer.y = e.clientY - rect.top;
			if (!pointer.active) {
				pointer.smoothX = pointer.x;
				pointer.smoothY = pointer.y;
			}
			pointer.active = true;
		};

		const handlePointerLeave = () => {
			pointer.active = false;
		};

		buildScene();
		syncPlayback();

		const ro = new ResizeObserver(handleResize);
		ro.observe(container);
		reducedMotionQuery.addEventListener("change", syncPlayback);
		document.addEventListener("visibilitychange", syncPlayback);
		window.addEventListener("pointermove", handlePointerMove, {
			passive: true,
		});
		window.addEventListener("pointerleave", handlePointerLeave);

		return () => {
			stopLoop();
			ro.disconnect();
			reducedMotionQuery.removeEventListener("change", syncPlayback);
			document.removeEventListener("visibilitychange", syncPlayback);
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerleave", handlePointerLeave);
		};
	}, []);

	return (
		<div
			ref={containerRef}
			className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
			aria-hidden="true"
		>
			<canvas ref={canvasRef} className="block h-full w-full" />
		</div>
	);
}
