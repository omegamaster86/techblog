#!/usr/bin/env node
/**
 * Records the galaxy hero animation from OpenAI's GPT-6 Astra page.
 *
 * Headless capture is blocked by Cloudflare. Prefer screen-recording the live
 * page in a real browser, then run:
 *
 *   ffmpeg -i recording.mp4 -ss 10 -t 12 \
 *     -vf "crop=1040:900:440:250,scale=1280:720" \
 *     -an public/backgrounds/galaxy.mp4
 *
 * Usage (may fail behind Cloudflare): node scripts/capture-openai-astra-video.mjs
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
const FRAMES_DIR = join(ROOT, ".tmp", "openai-astra-frames");

const ASTRA_URL = "https://openai.com/index/gpt-6-astra/";
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
/** Crop to the central galaxy (excludes GPT / Astra side labels). */
const CROP = { x: 420, y: 0, width: 1080, height: 1080 };
const WARMUP_SEC = 4;
const RECORD_SEC = 15;
const CHROME_PATH =
	process.env.CHROME_PATH || "/usr/local/bin/google-chrome";

async function run(cmd, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: "inherit" });
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`${cmd} exited with code ${code}`));
		});
	});
}

async function dismissCookieBanner(page) {
	await page.evaluate(() => {
		for (const button of document.querySelectorAll("button")) {
			const label = button.textContent?.trim().toLowerCase() ?? "";
			if (
				label.includes("accept all") ||
				label === "accept" ||
				label.includes("同意")
			) {
				button.click();
				return;
			}
		}
	});
	await new Promise((r) => setTimeout(r, 500));
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
		await page.goto(ASTRA_URL, {
			waitUntil: "networkidle2",
			timeout: 120_000,
		});
		await dismissCookieBanner(page);
		await new Promise((r) => setTimeout(r, WARMUP_SEC * 1000));

		const totalFrames = RECORD_SEC * FPS;
		for (let i = 0; i < totalFrames; i++) {
			const buffer = await page.screenshot({
				type: "png",
				clip: CROP,
			});
			const framePath = join(
				FRAMES_DIR,
				`frame-${String(i).padStart(5, "0")}.png`,
			);
			await writeFile(framePath, buffer);
			await new Promise((r) => setTimeout(r, 1000 / FPS));
		}

		const posterFrame = join(FRAMES_DIR, "frame-00120.png");
		await run("ffmpeg", [
			"-y",
			"-i",
			posterFrame,
			"-update",
			"1",
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
			"-vf",
			"scale=1280:720",
			"-c:v",
			"libx264",
			"-crf",
			"23",
			"-preset",
			"medium",
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
			"-vf",
			"scale=1280:720",
			"-c:v",
			"libvpx-vp9",
			"-crf",
			"38",
			"-b:v",
			"0",
			"-row-mt",
			"1",
			join(OUT_DIR, "galaxy.webm"),
		]);
	} finally {
		await browser.close();
	}

	console.log("Captured OpenAI Astra background to public/backgrounds/");
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
