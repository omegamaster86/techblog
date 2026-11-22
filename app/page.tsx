import { LinkForm } from "./components/link-form";
import { LinkList } from "./components/link-list";
import { SpaceBackground } from "./components/space-background";

export default function Home() {
	return (
		<div className="relative min-h-screen px-4 pt-12 pb-16 sm:pt-16 bg-[#070b1b] overflow-x-hidden">
			<SpaceBackground />
			<div className="relative z-10">
				<LinkForm />
				<LinkList />
			</div>
		</div>
	);
}
