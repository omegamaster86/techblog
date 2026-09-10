"use client";

import { useRef } from "react";
import { ReplayButton, SpaceBackground } from "./space-background";

export function HeroSection() {
	const replayRef = useRef<(() => void) | null>(null);

	return (
		<section className="relative h-[min(100svh,720px)] min-h-[480px] overflow-hidden">
			<SpaceBackground
				onReplayReady={(replay) => {
					replayRef.current = replay;
				}}
			/>
			<ReplayButton onClick={() => replayRef.current?.()} />
		</section>
	);
}
