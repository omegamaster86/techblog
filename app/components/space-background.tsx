"use client";

import { useEffect, useRef } from "react";

type Point = { x: number; y: number };
type Rgb = [number, number, number];

type CubicSpec = {
	p0: Point;
	p1: Point;
	p2: Point;
	p3: Point;
};

type PathDef = {
	kind: "gold" | "blue";
	depth: number;
	phase: number;
	speed: number;
	strong: boolean;
	endWidthStart: number;
	endWidthSettled: number;
	followupDensity: number;
	samples: Float32Array;
};

type StarParticle = {
	pathIndex: number;
	orbitProgress: number;
	acrossOffset: number;
	depthOffset: number;
	scale: number;
	layer: number;
	brightness: number;
	opacity: number;
	twinklePhase: number;
	twinkleRate: number;
	colorIndex: number;
	isFollowup: boolean;
	hasCrossFlare: boolean;
	hx: number;
	hy: number;
	hvx: number;
	hvy: number;
};

type DustParticle = {
	pathIndex: number;
	orbitProgress: number;
	acrossOffset: number;
	depthOffset: number;
	driftPhase: number;
	scale: number;
	opacity: number;
	colorIndex: number;
	hx: number;
	hy: number;
	hvx: number;
	hvy: number;
};

type AmbientStar = {
	baseX: number;
	baseY: number;
	r: number;
	brightness: number;
	twinklePhase: number;
	twinkleRate: number;
	warm: boolean;
};

type SpriteBank = {
	goldStars: HTMLCanvasElement[];
	blueStars: HTMLCanvasElement[];
	goldDust: HTMLCanvasElement[];
	blueDust: HTMLCanvasElement[];
};

const PATH_SAMPLES = 512;
const FLOW_SPEED = 0.55;
const TRAIL_DISPERSION = 0.56;
const TWINKLE_SPEED = 0.45;
const DUST_DRIFT_SPEED = 0.2;
const SCROLL_TRAVEL_SECONDS = 12;

const GOLD_STAR_HEX = ["#FFC77D", "#FFE5BD", "#E8AC62", "#FFF2D9", "#FFFAF0"];
const BLUE_STAR_HEX = ["#94CCF4", "#D7EDFF", "#639EC4", "#B8E0FA", "#F2FAFF"];

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

function clamp(v: number, min: number, max: number) {
	return v < min ? min : v > max ? max : v;
}

function lerp(a: number, b: number, t: number) {
	return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number) {
	const t = clamp((x - edge0) / Math.max(edge1 - edge0, 1e-6), 0, 1);
	return t * t * (3 - 2 * t);
}

function smootherstep(edge0: number, edge1: number, x: number) {
	const t = clamp((x - edge0) / Math.max(edge1 - edge0, 1e-6), 0, 1);
	return t * t * t * (t * (t * 6 - 15) + 10);
}

function hexToRgb(hex: string): Rgb {
	const clean = hex.replace("#", "");
	const n = Number.parseInt(clean, 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function sampleCubicChain(segments: CubicSpec[]): Float32Array {
	const out = new Float32Array(PATH_SAMPLES * 4);
	const segCount = segments.length;

	const evalSeg = (s: CubicSpec, t: number) => {
		const u = 1 - t;
		const uu = u * u;
		const tt = t * t;
		const x =
			uu * u * s.p0.x +
			3 * uu * t * s.p1.x +
			3 * u * tt * s.p2.x +
			tt * t * s.p3.x;
		const y =
			uu * u * s.p0.y +
			3 * uu * t * s.p1.y +
			3 * u * tt * s.p2.y +
			tt * t * s.p3.y;
		const dx =
			3 * uu * (s.p1.x - s.p0.x) +
			6 * u * t * (s.p2.x - s.p1.x) +
			3 * tt * (s.p3.x - s.p2.x);
		const dy =
			3 * uu * (s.p1.y - s.p0.y) +
			6 * u * t * (s.p2.y - s.p1.y) +
			3 * tt * (s.p3.y - s.p2.y);
		const len = Math.hypot(dx, dy) || 1;
		return { x, y, tx: dx / len, ty: dy / len };
	};

	const rawSteps = 256;
	const rawX = new Float32Array(rawSteps + 1);
	const rawY = new Float32Array(rawSteps + 1);
	const rawTx = new Float32Array(rawSteps + 1);
	const rawTy = new Float32Array(rawSteps + 1);
	const cumLen = new Float32Array(rawSteps + 1);

	let totalLen = 0;
	for (let i = 0; i <= rawSteps; i++) {
		const uGlobal = i / rawSteps;
		const scaled = uGlobal * segCount;
		const segIdx = Math.min(segCount - 1, Math.floor(scaled));
		const localT = scaled - segIdx;
		const p = evalSeg(segments[segIdx], localT);
		rawX[i] = p.x;
		rawY[i] = p.y;
		rawTx[i] = p.tx;
		rawTy[i] = p.ty;
		if (i > 0) {
			totalLen += Math.hypot(p.x - rawX[i - 1], p.y - rawY[i - 1]);
		}
		cumLen[i] = totalLen;
	}

	let cursor = 0;
	for (let i = 0; i < PATH_SAMPLES; i++) {
		const target = (i / (PATH_SAMPLES - 1)) * totalLen;
		while (cursor < rawSteps - 1 && cumLen[cursor + 1] < target) {
			cursor++;
		}
		const segLen = Math.max(cumLen[cursor + 1] - cumLen[cursor], 1e-6);
		const f = clamp((target - cumLen[cursor]) / segLen, 0, 1);
		const idx = i * 4;
		out[idx] = lerp(rawX[cursor], rawX[cursor + 1], f);
		out[idx + 1] = lerp(rawY[cursor], rawY[cursor + 1], f);
		const tx = lerp(rawTx[cursor], rawTx[cursor + 1], f);
		const ty = lerp(rawTy[cursor], rawTy[cursor + 1], f);
		const tLen = Math.hypot(tx, ty) || 1;
		out[idx + 2] = tx / tLen;
		out[idx + 3] = ty / tLen;
	}

	return out;
}

function lookupPath(samples: Float32Array, progress: number) {
	const scaled = clamp(progress, 0, 1) * (PATH_SAMPLES - 1);
	const lo = Math.floor(scaled);
	const hi = Math.min(lo + 1, PATH_SAMPLES - 1);
	const f = scaled - lo;
	const i0 = lo * 4;
	const i1 = hi * 4;
	return {
		x: lerp(samples[i0], samples[i1], f),
		y: lerp(samples[i0 + 1], samples[i1 + 1], f),
		tx: lerp(samples[i0 + 2], samples[i1 + 2], f),
		ty: lerp(samples[i0 + 3], samples[i1 + 3], f),
	};
}

function createStarSprite(hex: string, size: number, isDust: boolean) {
	const c = document.createElement("canvas");
	c.width = size;
	c.height = size;
	const sctx = c.getContext("2d");
	if (!sctx) return c;
	const [r, g, b] = hexToRgb(hex);
	const half = size / 2;
	const grad = sctx.createRadialGradient(half, half, 0, half, half, half);

	if (isDust) {
		grad.addColorStop(0, `rgba(${r},${g},${b},0.85)`);
		grad.addColorStop(0.55, `rgba(${r},${g},${b},0.42)`);
		grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
	} else {
		grad.addColorStop(0, "rgba(255,255,255,1)");
		grad.addColorStop(
			0.24,
			`rgba(${Math.min(255, r + 40)},${Math.min(255, g + 40)},${Math.min(255, b + 40)},0.92)`,
		);
		grad.addColorStop(0.56, `rgba(${r},${g},${b},0.35)`);
		grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
	}

	sctx.fillStyle = grad;
	sctx.fillRect(0, 0, size, size);
	return c;
}

function buildSpriteBank(): SpriteBank {
	return {
		goldStars: GOLD_STAR_HEX.map((hex) => createStarSprite(hex, 32, false)),
		blueStars: BLUE_STAR_HEX.map((hex) => createStarSprite(hex, 32, false)),
		goldDust: GOLD_STAR_HEX.map((hex) => createStarSprite(hex, 48, true)),
		blueDust: BLUE_STAR_HEX.map((hex) => createStarSprite(hex, 48, true)),
	};
}

function trailSpreadScale(progress: number, endWidth: number) {
	const taper = lerp(1, endWidth, smoothstep(0.94, 1, progress));
	return (
		taper * (1 + TRAIL_DISPERSION * 11.5 * (1 - clamp(progress, 0, 1)) ** 1.35)
	);
}

function stepHoverWake(
	p: { hx: number; hy: number; hvx: number; hvy: number },
	screenX: number,
	screenY: number,
	scaleFactor: number,
	particleSizeNorm: number,
	dt: number,
	stroke: { x: number; y: number; dx: number; dy: number } | null,
) {
	if (dt > 0 && (p.hx || p.hy || p.hvx || p.hvy)) {
		const n = clamp((particleSizeNorm - 1) / 13, 0, 1);
		const s = 2.3 / Math.sqrt(0.65 + 1.75 * n * n * (3 - 2 * n));
		const l = Math.exp(-s * dt);
		const o = Math.exp(-dt);
		const c = (o - l) / (s - 1);
		p.hx = p.hx * o + p.hvx * c;
		p.hy = p.hy * o + p.hvy * c;
		p.hvx *= l;
		p.hvy *= l;
		if (
			Math.abs(p.hx) + Math.abs(p.hy) + Math.abs(p.hvx) + Math.abs(p.hvy) <
			0.02
		) {
			p.hx = 0;
			p.hy = 0;
			p.hvx = 0;
			p.hvy = 0;
		}
	}

	if (stroke && (stroke.dx !== 0 || stroke.dy !== 0)) {
		const dist = Math.hypot(
			screenX + p.hx - stroke.x,
			screenY + p.hy - stroke.y,
		);
		if (dist < 190) {
			const d = (1 - dist / 190) ** 2;
			p.hvx += stroke.dx * d * 8 * scaleFactor;
			p.hvy += stroke.dy * d * 8 * scaleFactor;
		}
	}
}

function drawFourPointFlare(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	size: number,
	coreRadius: number,
	tint: Rgb,
	alpha: number,
	includeDiagonal: boolean,
	hoverDirX = 0,
	hoverDirY = 0,
	hoverStrength = 0,
) {
	if (alpha < 0.015 || size < 1) return;
	ctx.save();
	ctx.globalCompositeOperation = "lighter";

	const aura = ctx.createRadialGradient(x, y, 0, x, y, size * 0.42);
	aura.addColorStop(0, `rgba(255,255,255,${0.9 * alpha})`);
	aura.addColorStop(
		0.22,
		`rgba(${tint[0]},${tint[1]},${tint[2]},${0.48 * alpha})`,
	);
	aura.addColorStop(
		0.58,
		`rgba(${tint[0]},${tint[1]},${tint[2]},${0.1 * alpha})`,
	);
	aura.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = aura;
	ctx.beginPath();
	ctx.arc(x, y, size * 0.42, 0, Math.PI * 2);
	ctx.fill();

	const drawHalfSpike = (
		angle: number,
		length: number,
		halfWidth: number,
		op: number,
	) => {
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(angle);
		const grad = ctx.createLinearGradient(0, 0, length, 0);
		grad.addColorStop(0, `rgba(255,255,255,${0.98 * op})`);
		grad.addColorStop(
			0.35,
			`rgba(${tint[0]},${tint[1]},${tint[2]},${0.36 * op})`,
		);
		grad.addColorStop(1, "rgba(255,255,255,0)");
		ctx.fillStyle = grad;
		ctx.beginPath();
		ctx.moveTo(0, -halfWidth);
		ctx.quadraticCurveTo(length * 0.45, -halfWidth * 0.28, length, 0);
		ctx.quadraticCurveTo(length * 0.45, halfWidth * 0.28, 0, halfWidth);
		ctx.closePath();
		ctx.fill();
		ctx.restore();
	};

	const halfW = Math.max(0.7, size * 0.024);
	const boost = (dx: number, dy: number) =>
		1 +
		hoverStrength *
			clamp((dx * hoverDirX + dy * hoverDirY) * 0.45, -0.18, 0.36);

	drawHalfSpike(0, size * boost(1, 0), halfW, alpha * boost(1, 0));
	drawHalfSpike(Math.PI, size * boost(-1, 0), halfW, alpha * boost(-1, 0));
	drawHalfSpike(
		Math.PI / 2,
		size * 0.94 * boost(0, 1),
		halfW,
		alpha * boost(0, 1),
	);
	drawHalfSpike(
		-Math.PI / 2,
		size * 0.94 * boost(0, -1),
		halfW,
		alpha * boost(0, -1),
	);

	if (includeDiagonal) {
		const diagLen = size * 0.26;
		const diagW = Math.max(0.5, size * 0.016);
		drawHalfSpike(Math.PI / 4, diagLen, diagW, alpha * 0.46);
		drawHalfSpike((-3 * Math.PI) / 4, diagLen, diagW, alpha * 0.46);
		drawHalfSpike(-Math.PI / 4, diagLen, diagW, alpha * 0.46);
		drawHalfSpike((3 * Math.PI) / 4, diagLen, diagW, alpha * 0.46);
	}

	const core = ctx.createRadialGradient(x, y, 0, x, y, coreRadius);
	core.addColorStop(0, `rgba(255,255,255,${alpha})`);
	core.addColorStop(0.55, `rgba(255,255,255,${0.86 * alpha})`);
	core.addColorStop(1, "rgba(255,255,255,0)");
	ctx.fillStyle = core;
	ctx.beginPath();
	ctx.arc(x, y, coreRadius, 0, Math.PI * 2);
	ctx.fill();

	ctx.restore();
}

function drawPoisedSolOrb(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	radius: number,
	reveal: number,
	elapsedSec: number,
	hoverX: number,
	hoverY: number,
	hoverStrength: number,
) {
	if (reveal <= 0.005) return;

	ctx.save();
	ctx.globalCompositeOperation = "screen";

	const outerR = radius * 4.4;
	const haloOuter = ctx.createRadialGradient(x, y, radius * 0.72, x, y, outerR);
	haloOuter.addColorStop(0, `rgba(255, 206, 134, ${0.56 * reveal})`);
	haloOuter.addColorStop(0.24, `rgba(222, 146, 78, ${0.27 * reveal})`);
	haloOuter.addColorStop(0.54, `rgba(128, 70, 38, ${0.085 * reveal})`);
	haloOuter.addColorStop(0.78, `rgba(64, 34, 18, ${0.024 * reveal})`);
	haloOuter.addColorStop(1, "rgba(0, 0, 0, 0)");
	ctx.fillStyle = haloOuter;
	ctx.beginPath();
	ctx.arc(x, y, outerR, 0, Math.PI * 2);
	ctx.fill();

	const rimR = radius * 1.75;
	const haloRim = ctx.createRadialGradient(x, y, radius * 0.86, x, y, rimR);
	haloRim.addColorStop(0, `rgba(255, 246, 224, ${0.95 * reveal})`);
	haloRim.addColorStop(0.28, `rgba(255, 204, 132, ${0.72 * reveal})`);
	haloRim.addColorStop(0.65, `rgba(218, 142, 74, ${0.2 * reveal})`);
	haloRim.addColorStop(1, "rgba(0, 0, 0, 0)");
	ctx.fillStyle = haloRim;
	ctx.beginPath();
	ctx.arc(x, y, rimR, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();

	ctx.save();
	ctx.globalAlpha = reveal;
	const limbGrad = ctx.createRadialGradient(
		x - radius * 0.14,
		y - radius * 0.14,
		0,
		x,
		y,
		radius * 1.04,
	);
	limbGrad.addColorStop(0, "#fffdf8");
	limbGrad.addColorStop(0.62, "#fff5df");
	limbGrad.addColorStop(0.86, "#ffd694");
	limbGrad.addColorStop(0.96, "#f0aa5a");
	limbGrad.addColorStop(1, "rgba(240, 170, 90, 0)");
	ctx.fillStyle = limbGrad;
	ctx.beginPath();
	ctx.arc(x, y, radius * 1.04, 0, Math.PI * 2);
	ctx.fill();

	ctx.globalCompositeOperation = "lighter";
	const sheenAngle = elapsedSec * 0.18;
	const sx = x + Math.cos(sheenAngle) * radius * 0.16;
	const sy = y + Math.sin(sheenAngle * 0.8) * radius * 0.14;
	const sheen = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius * 0.72);
	sheen.addColorStop(0, "rgba(255, 250, 232, 0.22)");
	sheen.addColorStop(0.6, "rgba(255, 206, 132, 0.08)");
	sheen.addColorStop(1, "rgba(255, 206, 132, 0)");
	ctx.fillStyle = sheen;
	ctx.beginPath();
	ctx.arc(x, y, radius * 0.96, 0, Math.PI * 2);
	ctx.fill();

	if (hoverStrength > 0.01) {
		const hx = x + hoverX * radius * 0.55;
		const hy = y + hoverY * radius * 0.55;
		const hGrad = ctx.createRadialGradient(hx, hy, 0, hx, hy, radius * 0.95);
		hGrad.addColorStop(
			0,
			`rgba(255, 240, 205, ${0.34 * hoverStrength * reveal})`,
		);
		hGrad.addColorStop(1, "rgba(255, 199, 125, 0)");
		ctx.fillStyle = hGrad;
		ctx.beginPath();
		ctx.arc(x, y, radius * 1.35, 0, Math.PI * 2);
		ctx.fill();
	}
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

		const sprites = buildSpriteBank();

		let width = 1;
		let height = 1;
		let dpr = 1;
		let scale = 1;
		let paths: PathDef[] = [];
		let stars: StarParticle[] = [];
		let dust: DustParticle[] = [];
		let ambientStars: AmbientStar[] = [];
		let solPos: Point = { x: 0, y: 0 };
		let astraPos: Point = { x: 0, y: 0 };
		let solRadius = 36;
		let astraStarSize = 100;

		const pointer = {
			active: false,
			x: 0,
			y: 0,
			prevX: 0,
			prevY: 0,
			dx: 0,
			dy: 0,
			hoverStrength: 0,
			solHoverX: 0,
			solHoverY: 0,
			solHoverZ: 0,
			astraHoverX: 0,
			astraHoverY: 0,
			astraHoverZ: 0,
		};

		let scrollNorm = 0;
		let smoothScroll = 0;

		const readScroll = () => {
			const h = Math.max(window.innerHeight, 1);
			const s = clamp(window.scrollY / h, 0, 1);
			scrollNorm = s * (2 - s);
		};

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

			const isCompact = width < 768;
			const px = (nx: number) => nx * width;
			const py = (ny: number) => ny * height;

			solPos = isCompact
				? { x: px(0.88), y: py(0.125) }
				: { x: px(0.912), y: py(0.175) };
			astraPos = isCompact
				? { x: px(0.22), y: py(0.835) }
				: { x: px(0.375), y: py(0.805) };

			solRadius = 37 * scale;
			astraStarSize = 100 * scale;

			// Upper Gold front path: left outside -> upper arch -> converges INTO Sol orb
			const goldFrontSegs: CubicSpec[] = isCompact
				? [
						{
							p0: { x: px(-0.08), y: py(0.22) },
							p1: { x: px(0.14), y: py(0.05) },
							p2: { x: px(0.38), y: py(-0.01) },
							p3: { x: px(0.56), y: py(0.02) },
						},
						{
							p0: { x: px(0.56), y: py(0.02) },
							p1: { x: px(0.7), y: py(0.03) },
							p2: { x: px(0.81), y: py(0.07) },
							p3: solPos,
						},
					]
				: [
						{
							p0: { x: px(-0.05), y: py(0.27) },
							p1: { x: px(0.12), y: py(0.09) },
							p2: { x: px(0.34), y: py(0.015) },
							p3: { x: px(0.56), y: py(0.032) },
						},
						{
							p0: { x: px(0.56), y: py(0.032) },
							p1: { x: px(0.71), y: py(0.042) },
							p2: { x: px(0.83), y: py(0.095) },
							p3: solPos,
						},
					];

			const goldBackSegs: CubicSpec[] = goldFrontSegs.map((s, idx) => ({
				p0:
					idx === 0
						? { x: s.p0.x + px(0.01), y: s.p0.y + py(0.014) }
						: { x: s.p0.x, y: s.p0.y + py(0.012) },
				p1: { x: s.p1.x + px(0.008), y: s.p1.y + py(0.014) },
				p2: { x: s.p2.x + px(0.006), y: s.p2.y + py(0.014) },
				p3: idx === 1 ? solPos : { x: s.p3.x, y: s.p3.y + py(0.012) },
			}));

			// Lower Blue front path: right outside -> lower arch -> converges INTO Astra 4-point star
			const blueFrontSegs: CubicSpec[] = isCompact
				? [
						{
							p0: { x: px(1.06), y: py(0.71) },
							p1: { x: px(0.88), y: py(0.86) },
							p2: { x: px(0.68), y: py(0.95) },
							p3: { x: px(0.48), y: py(0.94) },
						},
						{
							p0: { x: px(0.48), y: py(0.94) },
							p1: { x: px(0.37), y: py(0.93) },
							p2: { x: px(0.28), y: py(0.89) },
							p3: astraPos,
						},
					]
				: [
						{
							p0: { x: px(1.05), y: py(0.65) },
							p1: { x: px(0.89), y: py(0.84) },
							p2: { x: px(0.72), y: py(0.95) },
							p3: { x: px(0.58), y: py(0.925) },
						},
						{
							p0: { x: px(0.58), y: py(0.925) },
							p1: { x: px(0.49), y: py(0.915) },
							p2: { x: px(0.42), y: py(0.87) },
							p3: astraPos,
						},
					];

			const blueBackSegs: CubicSpec[] = blueFrontSegs.map((s, idx) => ({
				p0:
					idx === 0
						? { x: s.p0.x - px(0.01), y: s.p0.y - py(0.012) }
						: { x: s.p0.x, y: s.p0.y - py(0.01) },
				p1: { x: s.p1.x - px(0.008), y: s.p1.y - py(0.012) },
				p2: { x: s.p2.x - px(0.006), y: s.p2.y - py(0.01) },
				p3: idx === 1 ? astraPos : { x: s.p3.x, y: s.p3.y - py(0.01) },
			}));

			paths = [
				{
					kind: "gold",
					depth: 0.22,
					phase: 0.16,
					speed: 0.025,
					strong: true,
					endWidthStart: 1,
					endWidthSettled: 1,
					followupDensity: 0,
					samples: sampleCubicChain(goldFrontSegs),
				},
				{
					kind: "gold",
					depth: -0.16,
					phase: 0.72,
					speed: -0.018,
					strong: false,
					endWidthStart: 1,
					endWidthSettled: 1,
					followupDensity: 0,
					samples: sampleCubicChain(goldBackSegs),
				},
				{
					kind: "blue",
					depth: 0.24,
					phase: 0.38,
					speed: 0.021,
					strong: true,
					endWidthStart: 0.22,
					endWidthSettled: 0.55,
					followupDensity: 0.6,
					samples: sampleCubicChain(blueFrontSegs),
				},
				{
					kind: "blue",
					depth: -0.18,
					phase: 0.58,
					speed: -0.016,
					strong: false,
					endWidthStart: 0.22,
					endWidthSettled: 0.55,
					followupDensity: 0.6,
					samples: sampleCubicChain(blueBackSegs),
				},
			];

			staticCtx.fillStyle = "#000000";
			staticCtx.fillRect(0, 0, width, height);

			staticCtx.save();
			staticCtx.globalCompositeOperation = "screen";
			const astraAmb = staticCtx.createRadialGradient(
				width * 0.64,
				height * 0.87,
				12 * scale,
				width * 0.64,
				height * 0.87,
				width * 0.3,
			);
			astraAmb.addColorStop(0, "rgba(88, 154, 236, 0.11)");
			astraAmb.addColorStop(0.42, "rgba(40, 84, 156, 0.045)");
			astraAmb.addColorStop(0.74, "rgba(16, 36, 74, 0.015)");
			astraAmb.addColorStop(1, "rgba(0, 0, 0, 0)");
			staticCtx.fillStyle = astraAmb;
			staticCtx.fillRect(0, 0, width, height);
			staticCtx.restore();

			const rand = mulberry32(20261124);
			const density = isCompact ? 0.62 : 1;

			ambientStars = [];
			const ambientCount = Math.round(115 * density);
			for (let i = 0; i < ambientCount; i++) {
				ambientStars.push({
					baseX: rand() * width,
					baseY: rand() * height,
					r: (0.45 + rand() * 0.9) * scale,
					brightness: 0.35 + rand() * 0.65,
					twinklePhase: rand() * Math.PI * 2,
					twinkleRate: 0.6 + rand() * 1.1,
					warm: rand() > 0.78,
				});
			}

			stars = [];
			dust = [];
			const baseWidthPx = 8.2 * scale;

			for (let pIdx = 0; pIdx < paths.length; pIdx++) {
				const path = paths[pIdx];
				const isFront = path.strong;
				const mainStarCount = Math.round((isFront ? 410 : 220) * density);
				const followupStarCount = Math.round(
					mainStarCount * path.followupDensity * 0.55,
				);
				const totalStars = mainStarCount + followupStarCount;

				for (let i = 0; i < totalStars; i++) {
					const isFollowup = i >= mainStarCount;
					const starScale = 0.45 + rand() ** 1.7 * 2.15;
					const depthOffset = (rand() - 0.5) * 1 + path.depth;
					const layer = clamp(
						starScale * 0.34 + (depthOffset + 0.5) * 0.45,
						0,
						1,
					);
					const brightness = 0.55 + rand() ** 2.4 * 2.1;
					const hasCrossFlare = isFront && brightness > 1.85 && rand() < 0.24;

					stars.push({
						pathIndex: pIdx,
						orbitProgress: rand(),
						acrossOffset:
							gaussianRandom(rand) * baseWidthPx * (isFront ? 0.72 : 0.92),
						depthOffset,
						scale: starScale,
						layer,
						brightness,
						opacity: (isFront ? 0.45 : 0.32) + rand() * 0.52,
						twinklePhase: rand() * Math.PI * 2,
						twinkleRate: 0.65 + rand() * 1.15,
						colorIndex: Math.floor(rand() * 5),
						isFollowup,
						hasCrossFlare,
						hx: 0,
						hy: 0,
						hvx: 0,
						hvy: 0,
					});
				}

				const dustCount = Math.round((isFront ? 220 : 120) * density);
				for (let i = 0; i < dustCount; i++) {
					dust.push({
						pathIndex: pIdx,
						orbitProgress: rand(),
						acrossOffset:
							gaussianRandom(rand) * baseWidthPx * (isFront ? 0.95 : 1.1),
						depthOffset: (rand() - 0.5) * 0.8 + path.depth,
						driftPhase: rand(),
						scale: (0.7 + rand() * 1.9) * scale,
						opacity: (isFront ? 0.24 : 0.16) + rand() * 0.24,
						colorIndex: Math.floor(rand() * 5),
						hx: 0,
						hy: 0,
						hvx: 0,
						hvy: 0,
					});
				}
			}
		};

		const renderFrame = (
			elapsedSec: number,
			dtSec: number,
			isReduced: boolean,
		) => {
			smoothScroll += (scrollNorm - smoothScroll) * Math.min(1, dtSec * 8 || 1);
			const scrollVal = isReduced ? 0 : smoothScroll;

			const stroke =
				!isReduced && pointer.active && (pointer.dx !== 0 || pointer.dy !== 0)
					? {
							x: pointer.x,
							y: pointer.y,
							dx: pointer.dx,
							dy: pointer.dy,
						}
					: null;
			pointer.dx = 0;
			pointer.dy = 0;

			const dampAlpha = 1 - Math.exp(-14 * Math.max(dtSec, 0.016));
			pointer.hoverStrength = lerp(
				pointer.hoverStrength,
				!isReduced && pointer.active ? 1 : 0,
				dampAlpha,
			);

			const introTime = isReduced ? 10 : elapsedSec;
			const solReveal = smootherstep(0.6, 1.65, introTime);
			const goldFadeProgress = clamp((introTime - 0.6) / 2.6, 0, 1);
			const blueStarReveal = smootherstep(1.77, 2.82, introTime);
			const blueFadeProgress = clamp((introTime - 1.77) / 2.6, 0, 1);
			const followupReveal = clamp((introTime - 4.37) / 1.8, 0, 1);
			const blueEndWidth = lerp(0.22, 0.55, smoothstep(0, 1, followupReveal));
			const skyReveal = smootherstep(0, 0.55, introTime);

			if (!isReduced && pointer.active) {
				const solReach = solRadius * 3.4;
				const sdx = (pointer.x - solPos.x) / solReach;
				const sdy = (pointer.y - solPos.y) / solReach;
				const sDist = Math.hypot(sdx, sdy);
				const sInf = 1 - smoothstep(0.35, 1, sDist);
				if (sInf > 0) {
					pointer.solHoverX = lerp(pointer.solHoverX, sdx, dampAlpha);
					pointer.solHoverY = lerp(pointer.solHoverY, sdy, dampAlpha);
				}
				pointer.solHoverZ = lerp(
					pointer.solHoverZ,
					sInf * solReveal,
					dampAlpha,
				);

				const astraReach = astraStarSize * 1.75;
				const adx = (pointer.x - astraPos.x) / astraReach;
				const ady = (pointer.y - astraPos.y) / astraReach;
				const aDist = Math.hypot(adx, ady);
				const aInf = 1 - smoothstep(0.35, 1, aDist);
				if (aInf > 0) {
					pointer.astraHoverX = lerp(pointer.astraHoverX, adx, dampAlpha);
					pointer.astraHoverY = lerp(pointer.astraHoverY, ady, dampAlpha);
				}
				pointer.astraHoverZ = lerp(
					pointer.astraHoverZ,
					aInf * blueStarReveal,
					dampAlpha,
				);
			} else {
				pointer.solHoverZ = lerp(pointer.solHoverZ, 0, dampAlpha);
				pointer.astraHoverZ = lerp(pointer.astraHoverZ, 0, dampAlpha);
			}

			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.drawImage(staticCanvas, 0, 0);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

			if (solReveal > 0.01) {
				ctx.save();
				ctx.globalCompositeOperation = "screen";
				const solAmb = ctx.createRadialGradient(
					solPos.x,
					solPos.y,
					6 * scale,
					solPos.x,
					solPos.y,
					width * 0.25,
				);
				solAmb.addColorStop(0, `rgba(255, 206, 138, ${0.32 * solReveal})`);
				solAmb.addColorStop(0.26, `rgba(216, 146, 82, ${0.145 * solReveal})`);
				solAmb.addColorStop(0.56, `rgba(112, 68, 42, ${0.048 * solReveal})`);
				solAmb.addColorStop(0.78, `rgba(56, 34, 20, ${0.016 * solReveal})`);
				solAmb.addColorStop(1, "rgba(0, 0, 0, 0)");
				ctx.fillStyle = solAmb;
				ctx.fillRect(0, 0, width, height);
				ctx.restore();
			}

			const cx = width * 0.5;
			const cy = height * 0.5;
			const hoverPushRadius = 0.28 * Math.min(width, height);
			for (const s of ambientStars) {
				const radialFactor = 1 + scrollVal * (0.05 + s.brightness * 0.08);
				let sx = cx + (s.baseX - cx) * radialFactor;
				let sy = cy + (s.baseY - cy) * radialFactor;

				if (pointer.hoverStrength > 0.01) {
					const awayX = sx - pointer.x;
					const awayY = sy - pointer.y;
					const dist = Math.hypot(awayX, awayY);
					if (dist < hoverPushRadius) {
						const inf = 1 - smoothstep(0, hoverPushRadius, dist);
						const push = inf * pointer.hoverStrength * 18 * scale;
						const inv = 1 / Math.max(dist, 12);
						sx += awayX * inv * push;
						sy += awayY * inv * push;
					}
				}

				const twinkle =
					0.86 +
					0.14 *
						Math.sin(
							s.twinklePhase +
								(isReduced ? 0 : elapsedSec) * TWINKLE_SPEED * s.twinkleRate,
						);
				const alpha = s.brightness * 0.62 * twinkle * skyReveal;
				ctx.fillStyle = s.warm
					? `rgba(255, 236, 205, ${alpha})`
					: `rgba(186, 222, 252, ${alpha})`;
				ctx.beginPath();
				ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
				ctx.fill();
			}

			const pathOffsets = new Float32Array(paths.length);
			const pathHeads = new Float32Array(paths.length);
			for (let i = 0; i < paths.length; i++) {
				const path = paths[i];
				const scrollShift =
					scrollVal * SCROLL_TRAVEL_SECONDS * path.speed * FLOW_SPEED;
				const timeShift = isReduced ? 0 : elapsedSec * path.speed * FLOW_SPEED;
				pathOffsets[i] = timeShift + scrollShift;

				const rawTravel = isReduced
					? path.phase
					: (((path.phase +
							elapsedSec * Math.abs(path.speed) +
							Math.abs(scrollShift)) %
							1) +
							1) %
						1;
				pathHeads[i] = path.speed < 0 ? 1 - rawTravel : rawTravel;
			}

			// Orbital dust layer illuminated by traveling light head + trailing wake
			ctx.save();
			ctx.globalCompositeOperation = "lighter";
			for (const d of dust) {
				const path = paths[d.pathIndex];
				const isGold = path.kind === "gold";
				const fadeProgress = isGold ? goldFadeProgress : blueFadeProgress;
				if (fadeProgress <= 0.001) continue;

				const endWidth = isGold ? 1 : blueEndWidth;
				const direction = path.speed >= 0 ? 1 : -1;
				const head = pathHeads[d.pathIndex];
				const lightReach = path.strong ? 0.2 : 0.17;

				const distToHead = Math.abs(d.orbitProgress - head);
				let illum = 1 - smoothstep(lightReach * 0.08, lightReach, distToHead);
				illum *= illum;

				let distBehind =
					direction > 0 ? head - d.orbitProgress : d.orbitProgress - head;
				if (distBehind < 0) distBehind += 1;
				let trailIllum = 1 - smoothstep(0, 0.32, distBehind);
				trailIllum *= trailIllum;
				illum = Math.max(illum, trailIllum * 0.68);

				const distFromSource =
					direction > 0 ? d.orbitProgress : 1 - d.orbitProgress;
				const fadeStart = 0.54 * distFromSource + 0.2 * d.driftPhase;
				const revealAlpha = smoothstep(
					fadeStart,
					fadeStart + 0.26,
					fadeProgress,
				);
				if (revealAlpha < 0.01) continue;

				const driftCycle = isReduced
					? 0.5
					: (d.driftPhase + elapsedSec * DUST_DRIFT_SPEED) % 1;
				const driftFade = isReduced
					? 1
					: smoothstep(0, 0.1, driftCycle) *
						(1 - smoothstep(0.9, 1, driftCycle));

				const sample = lookupPath(path.samples, d.orbitProgress);
				const spread = trailSpreadScale(d.orbitProgress, endWidth);
				const nx = -sample.ty;
				const ny = sample.tx;
				const driftAlong = (driftCycle - 0.5) * 26 * scale * direction;

				const baseX =
					sample.x + nx * d.acrossOffset * spread + sample.tx * driftAlong;
				const baseY =
					sample.y + ny * d.acrossOffset * spread + sample.ty * driftAlong;

				stepHoverWake(d, baseX, baseY, 0.18, d.scale, dtSec, stroke);

				const pxX = baseX + d.hx;
				const pxY = baseY + d.hy;
				const alpha = clamp(
					d.opacity * (0.24 + illum * 0.76) * revealAlpha * driftFade,
					0,
					0.85,
				);
				if (alpha < 0.015) continue;

				const drawSize =
					(3.4 + d.scale * 2.8 + illum * 2.6) * (0.85 + 0.15 * path.depth);
				const bank = isGold
					? d.orbitProgress < 0.22
						? sprites.blueDust
						: sprites.goldDust
					: sprites.blueDust;
				ctx.globalAlpha = alpha;
				ctx.drawImage(
					bank[d.colorIndex],
					pxX - drawSize * 0.5,
					pxY - drawSize * 0.5,
					drawSize,
					drawSize,
				);
			}
			ctx.restore();

			// Counter-flowing 4-path star streams
			ctx.save();
			ctx.globalCompositeOperation = "lighter";
			const flareQueue: Array<{
				x: number;
				y: number;
				size: number;
				alpha: number;
				tint: Rgb;
			}> = [];

			for (const s of stars) {
				const path = paths[s.pathIndex];
				const isGold = path.kind === "gold";
				const fadeProgress = isGold ? goldFadeProgress : blueFadeProgress;
				if (fadeProgress <= 0.001) continue;

				const endWidth = isGold ? 1 : blueEndWidth;
				const cruise = 0.42 + 1.65 * s.layer;
				const rawPhase = s.orbitProgress + pathOffsets[s.pathIndex] * cruise;
				const pathPhase = ((rawPhase % 1) + 1) % 1;
				const progress =
					pathPhase +
					(0.08 * Math.sin(pathPhase * Math.PI * 2)) / (Math.PI * 2);

				const distFromSource =
					path.speed > 0 ? s.orbitProgress : 1 - s.orbitProgress;
				const twinkleFrac = s.twinklePhase / (Math.PI * 2);
				const fadeStart = 0.54 * distFromSource + 0.2 * twinkleFrac;
				const revealAlpha = smoothstep(
					fadeStart,
					fadeStart + 0.26,
					fadeProgress,
				);
				const followupAlpha = s.isFollowup
					? smoothstep(
							0.2 * twinkleFrac,
							0.8 + 0.2 * twinkleFrac,
							followupReveal,
						)
					: 1;
				if (revealAlpha * followupAlpha < 0.01) continue;

				const endpointVis = smoothstep(0, 0.055, progress);
				const middleWeight = lerp(
					Math.sin(clamp(progress, 0, 1) * Math.PI),
					1,
					smoothstep(0.5, 1, progress),
				);
				const sizeEnvelope = lerp(
					1,
					0.14 + 0.86 * Math.max(middleWeight, 0) ** 0.68,
					0.12,
				);

				const sample = lookupPath(path.samples, progress);
				const spread = trailSpreadScale(progress, endWidth);
				const nx = -sample.ty;
				const ny = sample.tx;

				const belly = Math.sin(progress * Math.PI);
				const driftAmp = (0.18 + s.layer * 0.38) * belly * 24 * scale;
				const wave =
					(isReduced ? 0 : elapsedSec) * (0.28 + s.layer * 0.31) +
					s.twinklePhase;
				const waveX = Math.sin(wave + sample.y * 0.006) * driftAmp;
				const waveY = Math.cos(wave * 0.73 + sample.x * 0.004) * driftAmp;

				const baseX = sample.x + nx * s.acrossOffset * spread + waveX;
				const baseY = sample.y + ny * s.acrossOffset * spread + waveY;

				const wakeScale = 0.38 / Math.sqrt(Math.max(0.3, s.scale));
				stepHoverWake(s, baseX, baseY, wakeScale, 2 * s.scale, dtSec, stroke);

				const pxX = baseX + s.hx;
				const pxY = baseY + s.hy;

				const twinkle =
					0.86 +
					0.14 *
						Math.sin(
							s.twinklePhase +
								(isReduced ? 0 : elapsedSec) * TWINKLE_SPEED * s.twinkleRate,
						);

				const alpha = clamp(
					s.opacity *
						revealAlpha *
						followupAlpha *
						endpointVis *
						(0.92 + twinkle * 0.08),
					0,
					1,
				);
				if (alpha < 0.015) continue;

				const drawSize =
					(1.6 + s.scale * sizeEnvelope * endpointVis * 3.1) *
					(0.97 + twinkle * 0.03) *
					scale;

				const bank = isGold
					? progress < 0.2
						? sprites.blueStars
						: sprites.goldStars
					: sprites.blueStars;

				ctx.globalAlpha = alpha;
				ctx.drawImage(
					bank[s.colorIndex],
					pxX - drawSize * 0.5,
					pxY - drawSize * 0.5,
					drawSize,
					drawSize,
				);

				if (s.hasCrossFlare && endpointVis > 0.35) {
					flareQueue.push({
						x: pxX,
						y: pxY,
						size: (12 + s.brightness * 6.5) * scale,
						alpha: alpha * 0.82 * twinkle,
						tint: isGold
							? progress < 0.25
								? [190, 224, 255]
								: [255, 206, 134]
							: [164, 212, 255],
					});
				}
			}
			ctx.restore();

			for (const fl of flareQueue) {
				drawFourPointFlare(
					ctx,
					fl.x,
					fl.y,
					fl.size,
					fl.size * 0.14,
					fl.tint,
					fl.alpha,
					fl.size > 20 * scale,
				);
			}

			drawPoisedSolOrb(
				ctx,
				solPos.x,
				solPos.y,
				solRadius,
				solReveal,
				isReduced ? 0 : elapsedSec,
				pointer.solHoverX,
				pointer.solHoverY,
				pointer.solHoverZ,
			);

			if (blueStarReveal > 0.005) {
				drawFourPointFlare(
					ctx,
					astraPos.x,
					astraPos.y,
					astraStarSize,
					9.5 * scale,
					[148, 204, 244],
					blueStarReveal,
					true,
					pointer.astraHoverX,
					pointer.astraHoverY,
					pointer.astraHoverZ,
				);
			}
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
			const dtSec =
				lastFrameMs > 0 ? Math.min(0.05, (now - lastFrameMs) * 0.001) : 1 / 60;
			lastFrameMs = now;
			elapsedAccSec += dtSec;
			renderFrame(elapsedAccSec, dtSec, false);
			rafId = window.requestAnimationFrame(tick);
		};

		const syncPlayback = () => {
			stopLoop();
			if (reducedMotionQuery.matches) {
				renderFrame(10, 0, true);
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
			readScroll();
			renderFrame(
				reducedMotionQuery.matches ? 10 : elapsedAccSec,
				0,
				reducedMotionQuery.matches,
			);
		};

		const handlePointerMove = (e: PointerEvent) => {
			if (reducedMotionQuery.matches) return;
			const rect = container.getBoundingClientRect();
			const nx = e.clientX - rect.left;
			const ny = e.clientY - rect.top;
			if (!pointer.active) {
				pointer.prevX = nx;
				pointer.prevY = ny;
			}
			pointer.dx += nx - pointer.prevX;
			pointer.dy += ny - pointer.prevY;
			pointer.prevX = nx;
			pointer.prevY = ny;
			pointer.x = nx;
			pointer.y = ny;
			pointer.active = e.pointerType === "mouse" && e.buttons === 0;
		};

		const handlePointerLeave = () => {
			pointer.active = false;
		};

		buildScene();
		readScroll();
		syncPlayback();

		const ro = new ResizeObserver(handleResize);
		ro.observe(container);
		reducedMotionQuery.addEventListener("change", syncPlayback);
		document.addEventListener("visibilitychange", syncPlayback);
		window.addEventListener("pointermove", handlePointerMove, {
			passive: true,
		});
		window.addEventListener("pointerleave", handlePointerLeave);
		window.addEventListener("scroll", readScroll, { passive: true });

		return () => {
			stopLoop();
			ro.disconnect();
			reducedMotionQuery.removeEventListener("change", syncPlayback);
			document.removeEventListener("visibilitychange", syncPlayback);
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerleave", handlePointerLeave);
			window.removeEventListener("scroll", readScroll);
		};
	}, []);

	return (
		<div
			ref={containerRef}
			className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black"
			aria-hidden="true"
		>
			<canvas ref={canvasRef} className="block h-full w-full" />
		</div>
	);
}
