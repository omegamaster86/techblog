"use client";

import { useEffect, useRef } from "react";

type Point = { x: number; y: number };
type Rgb = [number, number, number];

type FlareSpec = {
	t: number;
	off: number;
	size: number;
	alpha: number;
	phase: number;
	speed: number;
	tint: Rgb;
	x: number;
	y: number;
	includeDiagonal: boolean;
};

type TwinkleStar = {
	x: number;
	y: number;
	r: number;
	baseAlpha: number;
	phase: number;
	speed: number;
	warm: boolean;
};

type DriftSparkle = {
	ribbon: "sol" | "astra";
	tBase: number;
	tSpeed: number;
	normalFactor: number;
	r: number;
	baseAlpha: number;
	phase: number;
	twinkleSpeed: number;
	hot: boolean;
};

type RibbonGeometry = {
	p0: Point;
	p1: Point;
	p2: Point;
	p3: Point;
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

function drawFourPointStar(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	size: number,
	coreRadius: number,
	tint: Rgb,
	alpha: number,
	includeDiagonal: boolean,
) {
	ctx.save();
	ctx.globalCompositeOperation = "lighter";

	const aura = ctx.createRadialGradient(x, y, 0, x, y, size * 0.42);
	aura.addColorStop(0, `rgba(255,255,255,${0.92 * alpha})`);
	aura.addColorStop(
		0.2,
		`rgba(${tint[0]},${tint[1]},${tint[2]},${0.5 * alpha})`,
	);
	aura.addColorStop(
		0.55,
		`rgba(${tint[0]},${tint[1]},${tint[2]},${0.11 * alpha})`,
	);
	aura.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = aura;
	ctx.beginPath();
	ctx.arc(x, y, size * 0.42, 0, Math.PI * 2);
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
			`rgba(${tint[0]},${tint[1]},${tint[2]},${0.32 * op})`,
		);
		grad.addColorStop(0.5, `rgba(255,255,255,${0.98 * op})`);
		grad.addColorStop(
			0.7,
			`rgba(${tint[0]},${tint[1]},${tint[2]},${0.32 * op})`,
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

	drawSpike(0, size, Math.max(0.7, size * 0.026), alpha);
	drawSpike(Math.PI / 2, size * 0.96, Math.max(0.7, size * 0.026), alpha);

	if (includeDiagonal) {
		drawSpike(
			Math.PI / 4,
			size * 0.24,
			Math.max(0.5, size * 0.018),
			alpha * 0.48,
		);
		drawSpike(
			-Math.PI / 4,
			size * 0.24,
			Math.max(0.5, size * 0.018),
			alpha * 0.48,
		);
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

function drawSolOrb(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	radius: number,
	pulse: number,
) {
	ctx.save();
	ctx.globalCompositeOperation = "screen";

	const outerR = radius * (4.2 + pulse * 0.16);
	const halo3 = ctx.createRadialGradient(x, y, radius * 0.65, x, y, outerR);
	halo3.addColorStop(0, `rgba(255, 206, 134, ${0.62 + pulse * 0.04})`);
	halo3.addColorStop(0.26, `rgba(222, 146, 78, ${0.34 + pulse * 0.03})`);
	halo3.addColorStop(0.56, "rgba(128, 70, 38, 0.12)");
	halo3.addColorStop(1, "rgba(0, 0, 0, 0)");
	ctx.fillStyle = halo3;
	ctx.beginPath();
	ctx.arc(x, y, outerR, 0, Math.PI * 2);
	ctx.fill();

	const midR = radius * (1.85 + pulse * 0.06);
	const halo2 = ctx.createRadialGradient(x, y, radius * 0.84, x, y, midR);
	halo2.addColorStop(0, "rgba(255, 246, 226, 0.96)");
	halo2.addColorStop(0.32, "rgba(255, 206, 138, 0.78)");
	halo2.addColorStop(0.68, "rgba(218, 142, 74, 0.26)");
	halo2.addColorStop(1, "rgba(0, 0, 0, 0)");
	ctx.fillStyle = halo2;
	ctx.beginPath();
	ctx.arc(x, y, midR, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();

	ctx.save();
	const disc = ctx.createRadialGradient(
		x - radius * 0.1,
		y - radius * 0.1,
		0,
		x,
		y,
		radius * 1.05,
	);
	disc.addColorStop(0, "#ffffff");
	disc.addColorStop(0.76, "#fffbf2");
	disc.addColorStop(0.92, "#ffe0ab");
	disc.addColorStop(1, "rgba(255, 198, 124, 0)");
	ctx.fillStyle = disc;
	ctx.beginPath();
	ctx.arc(x, y, radius * 1.05, 0, Math.PI * 2);
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
		let astraStarSize = 100;
		let stars: TwinkleStar[] = [];
		let flares: FlareSpec[] = [];
		let driftSparkles: DriftSparkle[] = [];

		const solWidth = (t: number) => {
			const belly = Math.sin(t ** 0.78 * Math.PI);
			return (lerp(34, 8, t ** 1.5) + belly * 12) * scale;
		};

		const astraWidth = (t: number) => (5 + t ** 0.85 * 45) * scale;

		const solColor = (t: number, kind: "bokeh" | "mid" | "hot"): Rgb => {
			const warmMix = Math.max(0, Math.min(1, (t - 0.1) / 0.7));
			if (kind === "bokeh") {
				return lerpColor([58, 94, 142], [174, 118, 64], warmMix);
			}
			if (kind === "hot") {
				return lerpColor([232, 244, 255], [255, 244, 214], warmMix);
			}
			return lerpColor([154, 194, 236], [246, 198, 134], warmMix);
		};

		const astraColor = (t: number, kind: "bokeh" | "mid" | "hot"): Rgb => {
			if (kind === "bokeh") {
				return lerpColor([72, 118, 178], [46, 82, 138], t);
			}
			if (kind === "hot") {
				return lerpColor([248, 252, 255], [218, 238, 255], t);
			}
			return lerpColor([198, 228, 255], [116, 168, 232], t);
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

			// 1. Deep midnight navy sky gradient
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

			// 2. Atmospheric color blooms
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
			solAmb.addColorStop(0, "rgba(255, 206, 138, 0.42)");
			solAmb.addColorStop(0.24, "rgba(216, 146, 82, 0.2)");
			solAmb.addColorStop(0.58, "rgba(112, 68, 42, 0.07)");
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
			astraAmb.addColorStop(0, "rgba(88, 148, 228, 0.17)");
			astraAmb.addColorStop(0.45, "rgba(40, 82, 150, 0.08)");
			astraAmb.addColorStop(1, "rgba(0, 0, 0, 0)");
			staticCtx.fillStyle = astraAmb;
			staticCtx.fillRect(0, 0, width, height);
			staticCtx.restore();

			// 3. Soft ribbon spine underlays
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

			// 4. Static bokeh & dense base stardust ribbons
			const bakeRibbonParticles = (
				g: RibbonGeometry,
				count: number,
				widthFn: (t: number) => number,
				colorFn: (t: number, kind: "bokeh" | "mid" | "hot") => Rgb,
			) => {
				// Bokeh discs
				for (let i = 0; i < Math.floor(count * 0.45); i++) {
					const t = rand();
					const pt = bezierPoint(g, t);
					const tan = bezierTangent(g, t);
					const nx = -tan.y;
					const ny = tan.x;
					const w = widthFn(t);
					const offset = gaussianRandom(rand) * w * 0.56;
					const x = pt.x + nx * offset;
					const y = pt.y + ny * offset;
					const distNorm = Math.min(1, Math.abs(offset) / (w * 1.15));
					const r = (1.4 + rand() * 3.75) * scale * (1 - distNorm * 0.35);
					const c = colorFn(t, "bokeh");
					const alpha = (0.16 + rand() * 0.3) * (1 - distNorm * 0.62);

					const grad = staticCtx.createRadialGradient(x, y, 0, x, y, r);
					grad.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${alpha})`);
					grad.addColorStop(
						0.75,
						`rgba(${c[0]},${c[1]},${c[2]},${alpha * 0.6})`,
					);
					grad.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
					staticCtx.fillStyle = grad;
					staticCtx.beginPath();
					staticCtx.arc(x, y, r, 0, Math.PI * 2);
					staticCtx.fill();
				}

				// Crisp stardust beads
				staticCtx.save();
				staticCtx.globalCompositeOperation = "lighter";
				for (let i = 0; i < count; i++) {
					const t = rand();
					const pt = bezierPoint(g, t);
					const tan = bezierTangent(g, t);
					const nx = -tan.y;
					const ny = tan.x;
					const w = widthFn(t);
					const spread =
						gaussianRandom(rand) * w * (rand() < 0.72 ? 0.36 : 0.74);
					const x = pt.x + nx * spread;
					const y = pt.y + ny * spread;
					const distNorm = Math.min(1, Math.abs(spread) / (w * 1.1));

					const sizeRoll = rand();
					let r: number;
					if (sizeRoll < 0.6) r = (0.45 + rand() * 0.95) * scale;
					else if (sizeRoll < 0.91) r = (1.1 + rand() * 1.45) * scale;
					else r = (2.1 + rand() * 1.55) * scale;

					const c = colorFn(t, sizeRoll > 0.78 ? "hot" : "mid");
					const alpha = (0.28 + rand() * 0.66) * (1 - distNorm * 0.56);

					if (r > 1.6 * scale) {
						const grad = staticCtx.createRadialGradient(
							x,
							y,
							0,
							x,
							y,
							r * 1.45,
						);
						grad.addColorStop(
							0,
							`rgba(255,255,255,${Math.min(1, alpha * 1.05)})`,
						);
						grad.addColorStop(
							0.38,
							`rgba(${c[0]},${c[1]},${c[2]},${alpha * 0.85})`,
						);
						grad.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
						staticCtx.fillStyle = grad;
						staticCtx.beginPath();
						staticCtx.arc(x, y, r * 1.45, 0, Math.PI * 2);
						staticCtx.fill();
					} else {
						staticCtx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
						staticCtx.beginPath();
						staticCtx.arc(x, y, r, 0, Math.PI * 2);
						staticCtx.fill();
					}
				}
				staticCtx.restore();
			};

			const densityScale = isCompact ? 0.65 : 1;
			bakeRibbonParticles(
				solGeometry,
				Math.round(1750 * densityScale),
				solWidth,
				solColor,
			);
			bakeRibbonParticles(
				astraGeometry,
				Math.round(1550 * densityScale),
				astraWidth,
				astraColor,
			);

			// 5. Prepare animated distant stars
			stars = [];
			for (let i = 0; i < 70; i++) {
				stars.push({
					x: rand() * width,
					y: rand() * height,
					r: (0.45 + rand() * 0.8) * scale,
					baseAlpha: 0.16 + rand() * 0.42,
					phase: rand() * Math.PI * 2,
					speed: 0.45 + rand() * 0.9,
					warm: rand() > 0.72,
				});
			}

			// 6. Prepare animated 4-point specular glints along both arcs
			const solFlares: Array<{
				t: number;
				off: number;
				size: number;
				alpha: number;
			}> = [
				{ t: 0.05, off: 0.08, size: 21, alpha: 0.88 },
				{ t: 0.14, off: -0.14, size: 16, alpha: 0.82 },
				{ t: 0.24, off: 0.08, size: 23, alpha: 0.92 },
				{ t: 0.36, off: -0.05, size: 18, alpha: 0.86 },
				{ t: 0.48, off: 0.1, size: 27, alpha: 0.96 },
				{ t: 0.6, off: -0.1, size: 19, alpha: 0.88 },
				{ t: 0.72, off: 0.06, size: 25, alpha: 0.95 },
				{ t: 0.82, off: -0.04, size: 22, alpha: 0.94 },
				{ t: 0.91, off: 0.02, size: 28, alpha: 0.98 },
			];

			const astraFlares: Array<{
				t: number;
				off: number;
				size: number;
				alpha: number;
			}> = [
				{ t: 0.14, off: -0.1, size: 14, alpha: 0.8 },
				{ t: 0.28, off: 0.08, size: 23, alpha: 0.92 },
				{ t: 0.42, off: -0.12, size: 18, alpha: 0.86 },
				{ t: 0.56, off: 0.14, size: 28, alpha: 0.96 },
				{ t: 0.71, off: -0.08, size: 19, alpha: 0.88 },
				{ t: 0.83, off: 0.06, size: 30, alpha: 0.96 },
				{ t: 0.93, off: -0.05, size: 24, alpha: 0.94 },
			];

			flares = [];
			for (const fp of solFlares) {
				const pt = bezierPoint(solGeometry, fp.t);
				const tan = bezierTangent(solGeometry, fp.t);
				const w = solWidth(fp.t);
				flares.push({
					...fp,
					size: fp.size * scale,
					x: pt.x - tan.y * (fp.off * w),
					y: pt.y + tan.x * (fp.off * w),
					phase: rand() * Math.PI * 2,
					speed: 0.65 + rand() * 0.7,
					tint: lerpColor(
						[195, 224, 255],
						[255, 206, 132],
						Math.min(1, fp.t * 1.2),
					),
					includeDiagonal: fp.size > 20,
				});
			}

			for (const fp of astraFlares) {
				const pt = bezierPoint(astraGeometry, fp.t);
				const tan = bezierTangent(astraGeometry, fp.t);
				const w = astraWidth(fp.t);
				flares.push({
					...fp,
					size: fp.size * scale,
					x: pt.x - tan.y * (fp.off * w),
					y: pt.y + tan.x * (fp.off * w),
					phase: rand() * Math.PI * 2,
					speed: 0.65 + rand() * 0.7,
					tint: [166, 212, 255],
					includeDiagonal: fp.size > 20,
				});
			}

			// 7. Prepare subtle drifting sparkles along both curves
			driftSparkles = [];
			const sparkleCount = isCompact ? 110 : 180;
			for (let i = 0; i < sparkleCount; i++) {
				const ribbon = i % 2 === 0 ? "sol" : "astra";
				driftSparkles.push({
					ribbon,
					tBase: rand(),
					tSpeed: (0.004 + rand() * 0.008) * (ribbon === "sol" ? 1 : 1),
					normalFactor: gaussianRandom(rand) * 0.42,
					r: (0.8 + rand() * 1.35) * scale,
					baseAlpha: 0.35 + rand() * 0.55,
					phase: rand() * Math.PI * 2,
					twinkleSpeed: 0.8 + rand() * 1.4,
					hot: rand() > 0.45,
				});
			}
		};

		const renderFrame = (elapsedSec: number) => {
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.drawImage(staticCanvas, 0, 0);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

			// Subtle twinkling distant stars
			for (const s of stars) {
				const tw = 0.78 + 0.22 * Math.sin(elapsedSec * s.speed + s.phase);
				const alpha = s.baseAlpha * tw;
				ctx.fillStyle = s.warm
					? `rgba(255, 238, 210, ${alpha})`
					: `rgba(210, 228, 255, ${alpha})`;
				ctx.beginPath();
				ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
				ctx.fill();
			}

			// Gently drifting stardust sparkles along each trajectory
			ctx.save();
			ctx.globalCompositeOperation = "lighter";
			for (const sp of driftSparkles) {
				const t = (sp.tBase + elapsedSec * sp.tSpeed) % 1;
				const g = sp.ribbon === "sol" ? solGeometry : astraGeometry;
				const w = sp.ribbon === "sol" ? solWidth(t) : astraWidth(t);
				const pt = bezierPoint(g, t);
				const tan = bezierTangent(g, t);
				const x = pt.x - tan.y * (sp.normalFactor * w);
				const y = pt.y + tan.x * (sp.normalFactor * w);
				const edgeFade = Math.sin(t * Math.PI);
				const tw =
					0.65 + 0.35 * Math.sin(elapsedSec * sp.twinkleSpeed + sp.phase);
				const alpha = sp.baseAlpha * tw * Math.min(1, edgeFade * 2.2);
				if (alpha < 0.03) continue;

				const c =
					sp.ribbon === "sol"
						? solColor(t, sp.hot ? "hot" : "mid")
						: astraColor(t, sp.hot ? "hot" : "mid");
				ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
				ctx.beginPath();
				ctx.arc(x, y, sp.r, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.restore();

			// 4-point specular glints along both arcs
			for (const f of flares) {
				const pulse = 0.84 + 0.16 * Math.sin(elapsedSec * f.speed + f.phase);
				drawFourPointStar(
					ctx,
					f.x,
					f.y,
					f.size * (0.94 + 0.06 * pulse),
					f.size * 0.14,
					f.tint,
					f.alpha * pulse,
					f.includeDiagonal,
				);
			}

			// Sol radiant solar orb (subtle corona breathing)
			const solPulse = Math.sin(elapsedSec * 0.65) * 0.5 + 0.5;
			drawSolOrb(ctx, solGeometry.p3.x, solGeometry.p3.y, solRadius, solPulse);

			// Astra 4-point star (gentle diffraction shimmer)
			const astraPulse = 0.92 + 0.08 * Math.sin(elapsedSec * 0.9 + 1.1);
			drawFourPointStar(
				ctx,
				astraGeometry.p0.x,
				astraGeometry.p0.y,
				astraStarSize * astraPulse,
				9.5 * scale,
				[175, 218, 255],
				1,
				true,
			);
		};

		let rafId = 0;
		let startTime = performance.now();

		const stopLoop = () => {
			if (rafId) {
				window.cancelAnimationFrame(rafId);
				rafId = 0;
			}
		};

		const tick = (now: number) => {
			const elapsedSec = (now - startTime) * 0.001;
			renderFrame(elapsedSec);
			rafId = window.requestAnimationFrame(tick);
		};

		const syncPlayback = () => {
			stopLoop();
			if (reducedMotionQuery.matches || document.hidden) {
				renderFrame(0);
				return;
			}
			startTime = performance.now();
			rafId = window.requestAnimationFrame(tick);
		};

		const handleResize = () => {
			buildScene();
			renderFrame(
				reducedMotionQuery.matches
					? 0
					: (performance.now() - startTime) * 0.001,
			);
		};

		buildScene();
		syncPlayback();

		const ro = new ResizeObserver(handleResize);
		ro.observe(container);
		reducedMotionQuery.addEventListener("change", syncPlayback);
		document.addEventListener("visibilitychange", syncPlayback);

		return () => {
			stopLoop();
			ro.disconnect();
			reducedMotionQuery.removeEventListener("change", syncPlayback);
			document.removeEventListener("visibilitychange", syncPlayback);
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
