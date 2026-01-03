"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type Planet = {
	pivot: THREE.Object3D;
	mesh: THREE.Mesh;
	orbitSpeed: number;
	rotationSpeed: number;
};

export function SpaceBackground() {
	const containerRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const renderer = new THREE.WebGLRenderer({
			antialias: true,
			alpha: false,
			powerPreference: "high-performance",
		});
		renderer.setClearColor(0x030014, 1);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.domElement.style.width = "100%";
		renderer.domElement.style.height = "100%";
		renderer.domElement.style.display = "block";
		container.appendChild(renderer.domElement);

		const scene = new THREE.Scene();
		scene.fog = new THREE.FogExp2(0x030014, 0.012);

		const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
		camera.position.set(0, 0, 45);

		const ambient = new THREE.AmbientLight(0xffffff, 0.6);
		scene.add(ambient);
		const key = new THREE.PointLight(0x88ccff, 1.2, 200);
		key.position.set(20, 10, 40);
		scene.add(key);

		// Distant starfield
		const starCount = 2000;
		const starsGeometry = new THREE.BufferGeometry();
		const starsPositions = new Float32Array(starCount * 3);
		for (let i = 0; i < starCount; i++) {
			const i3 = i * 3;
			const r = 220 * Math.cbrt(Math.random()); // denser center
			const theta = Math.random() * Math.PI * 2;
			const phi = Math.acos(2 * Math.random() - 1);
			starsPositions[i3] = r * Math.sin(phi) * Math.cos(theta);
			starsPositions[i3 + 1] = r * (Math.cos(phi) * 0.35); // flatten a bit
			starsPositions[i3 + 2] = r * Math.sin(phi) * Math.sin(theta);
		}
		starsGeometry.setAttribute(
			"position",
			new THREE.BufferAttribute(starsPositions, 3),
		);
		const starsMaterial = new THREE.PointsMaterial({
			color: 0xffffff,
			size: 0.12,
			sizeAttenuation: true,
			transparent: true,
			opacity: 0.75,
			depthWrite: false,
		});
		const stars = new THREE.Points(starsGeometry, starsMaterial);
		scene.add(stars);

		// Spiral galaxy (swirl)
		const galaxy = new THREE.Group();
		scene.add(galaxy);

		const galaxyCount = 12000;
		const galaxyGeometry = new THREE.BufferGeometry();
		const galaxyPositions = new Float32Array(galaxyCount * 3);
		const galaxyColors = new Float32Array(galaxyCount * 3);
		const innerColor = new THREE.Color("#b388ff");
		const outerColor = new THREE.Color("#00d9ff");
		for (let i = 0; i < galaxyCount; i++) {
			const i3 = i * 3;
			const radius = (Math.random() ** 0.55) * 50;
			const branch = i % 4;
			const branchAngle = (branch / 4) * Math.PI * 2;
			const spinAngle = radius * 0.35;
			const randomX = (Math.random() - 0.5) * 0.9 * (1 - radius / 55);
			const randomY = (Math.random() - 0.5) * 0.4 * (1 - radius / 55);
			const randomZ = (Math.random() - 0.5) * 0.9 * (1 - radius / 55);
			const angle = branchAngle + spinAngle;

			galaxyPositions[i3] = Math.cos(angle) * radius + randomX;
			galaxyPositions[i3 + 1] = randomY * 8;
			galaxyPositions[i3 + 2] = Math.sin(angle) * radius + randomZ;

			const mixed = innerColor.clone().lerp(outerColor, radius / 55);
			galaxyColors[i3] = mixed.r;
			galaxyColors[i3 + 1] = mixed.g;
			galaxyColors[i3 + 2] = mixed.b;
		}
		galaxyGeometry.setAttribute(
			"position",
			new THREE.BufferAttribute(galaxyPositions, 3),
		);
		galaxyGeometry.setAttribute("color", new THREE.BufferAttribute(galaxyColors, 3));
		const galaxyMaterial = new THREE.PointsMaterial({
			size: 0.08,
			sizeAttenuation: true,
			vertexColors: true,
			transparent: true,
			opacity: 0.95,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		});
		const galaxyPoints = new THREE.Points(galaxyGeometry, galaxyMaterial);
		galaxy.add(galaxyPoints);

		const createPlanet = (
			radius: number,
			color: THREE.ColorRepresentation,
			orbitRadius: number,
			orbitSpeed: number,
			rotationSpeed: number,
		): Planet => {
			const pivot = new THREE.Object3D();
			const geometry = new THREE.SphereGeometry(radius, 24, 24);
			const material = new THREE.MeshStandardMaterial({
				color,
				roughness: 0.8,
				metalness: 0.1,
			});
			const mesh = new THREE.Mesh(geometry, material);
			mesh.position.x = orbitRadius;
			pivot.add(mesh);
			galaxy.add(pivot);
			return { pivot, mesh, orbitSpeed, rotationSpeed };
		};

		const planets: Planet[] = [
			createPlanet(1.2, "#ffffff", 10, 0.22, 0.9),
			createPlanet(1.7, "#7c3aed", 16, 0.13, 0.7),
			createPlanet(2.4, "#22d3ee", 24, 0.08, 0.5),
		];

		const resize = () => {
			const width = Math.max(1, container.clientWidth);
			const height = Math.max(1, container.clientHeight);
			renderer.setSize(width, height, false);
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
		};

		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(container);

		const clock = new THREE.Clock();
		let rafId = 0;
		const animate = () => {
			rafId = window.requestAnimationFrame(animate);
			const t = clock.getElapsedTime();

			galaxy.rotation.y = t * 0.08;
			galaxy.rotation.z = t * 0.03;
			stars.rotation.y = t * 0.01;

			for (const p of planets) {
				p.pivot.rotation.y = t * p.orbitSpeed;
				p.mesh.rotation.y = t * p.rotationSpeed;
			}

			renderer.render(scene, camera);
		};
		animate();

		return () => {
			window.cancelAnimationFrame(rafId);
			ro.disconnect();

			for (const p of planets) {
				p.mesh.geometry.dispose();
				(p.mesh.material as THREE.Material).dispose();
			}

			starsGeometry.dispose();
			starsMaterial.dispose();
			galaxyGeometry.dispose();
			galaxyMaterial.dispose();
			renderer.dispose();

			// Remove canvas
			if (renderer.domElement.parentElement === container) {
				container.removeChild(renderer.domElement);
			}
		};
	}, []);

	return <div ref={containerRef} className="pointer-events-none absolute inset-0 z-0" aria-hidden="true" />;
}
