"use client";

import { useEffect, useRef, useState } from "react";

export function GalaxyVideoBackground() {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [reducedMotion, setReducedMotion] = useState(false);
	const [videoReady, setVideoReady] = useState(false);

	useEffect(() => {
		const media = window.matchMedia("(prefers-reduced-motion: reduce)");
		const update = () => setReducedMotion(media.matches);
		update();
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, []);

	useEffect(() => {
		if (reducedMotion) return;
		const video = videoRef.current;
		if (!video) return;

		const play = () => {
			void video.play().catch(() => {
				// Autoplay may be blocked until the next user gesture.
			});
		};

		play();
		video.addEventListener("canplay", play);
		return () => video.removeEventListener("canplay", play);
	}, [reducedMotion]);

	if (reducedMotion) {
		return (
			<img
				src="/backgrounds/galaxy-poster.jpg"
				alt=""
				className="absolute inset-0 h-full w-full object-cover"
				aria-hidden="true"
			/>
		);
	}

	return (
		<>
			<img
				src="/backgrounds/galaxy-poster.jpg"
				alt=""
				aria-hidden="true"
				className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
					videoReady ? "opacity-0" : "opacity-100"
				}`}
			/>
			<video
				ref={videoRef}
				className="absolute inset-0 h-full w-full object-cover"
				autoPlay
				loop
				muted
				playsInline
				preload="auto"
				poster="/backgrounds/galaxy-poster.jpg"
				aria-hidden="true"
				onCanPlay={() => setVideoReady(true)}
			>
				<source src="/backgrounds/galaxy.webm" type="video/webm" />
				<source src="/backgrounds/galaxy.mp4" type="video/mp4" />
			</video>
		</>
	);
}
