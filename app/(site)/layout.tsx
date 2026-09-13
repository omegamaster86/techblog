import { Providers } from "../providers";

export const dynamic = "force-dynamic";

export default function SiteLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return <Providers>{children}</Providers>;
}
