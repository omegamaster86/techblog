"use client";

import { useRef } from "react";
import { ReplayButton, SpaceBackground } from "./space-background";

export function HeroSection() {
	const replayRef = useRef<(() => void) | null>(null);

	return (
		<section className="relative min-h-[min(100svh,900px)] overflow-hidden bg-black">
			<SpaceBackground
				onReplayReady={(replay) => {
					replayRef.current = replay;
				}}
			/>

			<div
				className="pointer-events-none absolute inset-0 z-10 flex items-center justify-between px-[clamp(1.25rem,5vw,4.5rem)]"
				aria-hidden="true"
			>
				<span
					className="font-[family-name:var(--font-geist-sans)] text-[clamp(2.75rem,8.5vw,6.25rem)] font-normal leading-none tracking-[-0.04em] text-white"
				>
					GPT
				</span>
				<span
					className="font-[family-name:var(--font-geist-sans)] text-[clamp(2.75rem,8.5vw,6.25rem)] font-normal leading-none tracking-[-0.04em] text-white"
				>
					Astra
				</span>
			</div>

			<ReplayButton onClick={() => replayRef.current?.()} />
		</section>
	);
}
