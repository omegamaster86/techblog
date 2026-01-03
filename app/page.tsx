import { LinkForm } from "./components/link-form";
import { LinkList } from "./components/link-list";
import { SpaceBackground } from "./components/space-background";

export default function Home() {
	return (
		<div className="relative min-h-screen p-4 bg-[#030014]">
			<SpaceBackground />
			<div className="relative z-10">
				<LinkForm />
				<LinkList />
			</div>
		</div>
	);
}
