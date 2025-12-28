"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

type ProvidersProps = {
	children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
	return (
		<ConvexProvider client={convex}>
			<MantineProvider>{children}</MantineProvider>
		</ConvexProvider>
	);
}






