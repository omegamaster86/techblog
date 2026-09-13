import { MantineProvider } from "@mantine/core";

export default function CaptureGalaxyLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return <MantineProvider>{children}</MantineProvider>;
}
