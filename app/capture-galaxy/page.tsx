"use client";

import { useEffect, useRef } from "react";
import { SpaceBackground } from "../components/space-background";

/**
 * Full-screen page used only for offline video capture.
 * Visit /capture-galaxy while the dev server is running, then run
 * `node scripts/capture-galaxy-video.mjs`.
 */
export default function CaptureGalaxyPage() {
	const replayRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			replayRef.current?.();
		}, 500);
		return () => window.clearTimeout(timer);
	}, []);

	return (
		<div
			id="galaxy-capture-root"
			className="fixed inset-0 h-[1080px] w-[1920px] overflow-hidden bg-black"
		>
			<SpaceBackground
				onReplayReady={(replay) => {
					replayRef.current = replay;
				}}
			/>
		</div>
	);
}
