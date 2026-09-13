"use client";

import { useRef } from "react";
import { ReplayButton, SpaceBackground } from "./space-background";

export function HeroSection() {
	const replayRef = useRef<(() => void) | null>(null);

	return (
		<section className="relative h-svh min-h-[480px] overflow-hidden bg-black">
			<SpaceBackground
				onReplayReady={(replay) => {
					replayRef.current = replay;
				}}
			/>

			<div
				className="pointer-events-none absolute inset-0 z-10 flex items-center justify-between px-[clamp(1.5rem,7vw,6rem)]"
				aria-hidden="true"
			>
				<span
					className="font-[family-name:var(--font-geist-sans)] text-[clamp(3rem,9vw,6.75rem)] font-normal leading-none tracking-[-0.045em] text-white"
				>
					GPT
				</span>
				<span
					className="font-[family-name:var(--font-geist-sans)] text-[clamp(3rem,9vw,6.75rem)] font-normal leading-none tracking-[-0.045em] text-white"
				>
					Astra
				</span>
			</div>

			<ReplayButton onClick={() => replayRef.current?.()} />
		</section>
	);
}
