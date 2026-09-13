"use client";

import { GalaxyVideoBackground } from "./galaxy-video-background";

export function HeroSection() {
	return (
		<section className="relative h-[min(100svh,720px)] min-h-[480px] overflow-hidden bg-black">
			<GalaxyVideoBackground />
			<div
				className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32 bg-gradient-to-t from-[#030014] to-transparent"
				aria-hidden="true"
			/>
		</section>
	);
}
