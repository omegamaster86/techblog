#!/usr/bin/env node
/**
 * Captures the WebGL galaxy animation to WebM/MP4 poster assets.
 *
 * Prerequisites: dev server running on PORT (default 3000).
 * Usage: node scripts/capture-galaxy-video.mjs
 */

import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public", "backgrounds");
const FRAMES_DIR = join(ROOT, ".tmp", "galaxy-frames");

const PORT = Number(process.env.PORT || 3000);
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
/** Seconds to wait for intro convergence before recording. */
const INTRO_WAIT_SEC = 8.5;
/** Seconds of settled animation to record. */
const RECORD_SEC = 12;
const CHROME_PATH =
	process.env.CHROME_PATH || "/usr/local/bin/google-chrome";

async function run(cmd, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: "inherit", ...options });
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`${cmd} exited with code ${code}`));
		});
	});
}

async function main() {
	await rm(FRAMES_DIR, { recursive: true, force: true });
	await mkdir(FRAMES_DIR, { recursive: true });
	await mkdir(OUT_DIR, { recursive: true });

	const browser = await puppeteer.launch({
		executablePath: CHROME_PATH,
		headless: true,
		args: [
			"--no-sandbox",
			"--disable-setuid-sandbox",
			"--disable-dev-shm-usage",
			"--use-gl=angle",
			"--use-angle=swiftshader",
		],
		defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
	});

	try {
		const page = await browser.newPage();
		await page.goto(`http://127.0.0.1:${PORT}/capture-galaxy`, {
			waitUntil: "networkidle0",
			timeout: 120_000,
		});
		await page.waitForSelector("#galaxy-capture-root canvas", {
			timeout: 60_000,
		});
		await new Promise((r) => setTimeout(r, INTRO_WAIT_SEC * 1000));

		const totalFrames = RECORD_SEC * FPS;
		for (let i = 0; i < totalFrames; i++) {
			const canvas = await page.$("#galaxy-capture-root canvas");
			if (!canvas) throw new Error("Canvas not found");
			const buffer = await canvas.screenshot({ type: "png" });
			const framePath = join(
				FRAMES_DIR,
				`frame-${String(i).padStart(5, "0")}.png`,
			);
			await writeFile(framePath, buffer);
			await new Promise((r) => setTimeout(r, 1000 / FPS));
		}

		const posterFrame = join(FRAMES_DIR, "frame-00060.png");
		await run("ffmpeg", [
			"-y",
			"-i",
			posterFrame,
			"-q:v",
			"2",
			join(OUT_DIR, "galaxy-poster.jpg"),
		]);

		await run("ffmpeg", [
			"-y",
			"-framerate",
			String(FPS),
			"-i",
			join(FRAMES_DIR, "frame-%05d.png"),
			"-c:v",
			"libx264",
			"-pix_fmt",
			"yuv420p",
			"-crf",
			"23",
			"-movflags",
			"+faststart",
			join(OUT_DIR, "galaxy.mp4"),
		]);

		await run("ffmpeg", [
			"-y",
			"-framerate",
			String(FPS),
			"-i",
			join(FRAMES_DIR, "frame-%05d.png"),
			"-c:v",
			"libvpx-vp9",
			"-b:v",
			"0",
			"-crf",
			"32",
			"-row-mt",
			"1",
			join(OUT_DIR, "galaxy.webm"),
		]);
	} finally {
		await browser.close();
	}

	console.log("Wrote public/backgrounds/galaxy.{mp4,webm} and galaxy-poster.jpg");
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
