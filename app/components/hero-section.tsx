"use client";

import { useEffect, useRef, useState } from "react";
import { ReplayButton, SpaceBackground } from "./space-background";

function useHeroScrollFade(sectionRef: React.RefObject<HTMLElement | null>) {
	const [scrollFade, setScrollFade] = useState(1);
	const [gradientOpacity, setGradientOpacity] = useState(0.55);

	useEffect(() => {
		const section = sectionRef.current;
		if (!section) return;

		const update = () => {
			const rect = section.getBoundingClientRect();
			const scrolled = Math.max(0, -rect.top);
			// Astra fades the field within roughly the first third of the hero.
			const fadeDistance = Math.min(rect.height * 0.42, 280);
			const progress = Math.min(1, scrolled / fadeDistance);
			setScrollFade(1 - progress);
			setGradientOpacity(0.55 + progress * 0.4);
		};

		update();
		window.addEventListener("scroll", update, { passive: true });
		window.addEventListener("resize", update, { passive: true });
		return () => {
			window.removeEventListener("scroll", update);
			window.removeEventListener("resize", update);
		};
	}, [sectionRef]);

	return { scrollFade, gradientOpacity };
}

export function HeroSection() {
	const replayRef = useRef<(() => void) | null>(null);
	const sectionRef = useRef<HTMLElement | null>(null);
	const { scrollFade, gradientOpacity } = useHeroScrollFade(sectionRef);

	return (
		<section
			ref={sectionRef}
			className="relative h-[min(100svh,720px)] min-h-[480px] overflow-hidden"
		>
			<SpaceBackground
				scrollFade={scrollFade}
				onReplayReady={(replay) => {
					replayRef.current = replay;
				}}
			/>
			<div
				className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-40 bg-gradient-to-t from-[#030014] via-[#030014]/80 to-transparent transition-opacity duration-500 ease-out"
				style={{ opacity: gradientOpacity }}
				aria-hidden="true"
			/>
			<ReplayButton onClick={() => replayRef.current?.()} />
		</section>
	);
}
