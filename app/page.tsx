import { HeroSection } from "./components/hero-section";
import { LinkForm } from "./components/link-form";
import { LinkList } from "./components/link-list";

export default function Home() {
	return (
		<div className="relative min-h-screen bg-black">
			<HeroSection />

			<div className="relative z-10 bg-[#030014]/95 p-4 backdrop-blur-sm">
				<LinkForm />
				<LinkList />
			</div>
		</div>
	);
}
