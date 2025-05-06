import { Button, Card, Group, Text } from "@mantine/core";
import Link from "next/link";

type LinkCardProps = {
	title: string;
	href: string;
};

export default function LinkCard({ title, href }: LinkCardProps) {
	return (
		<Card shadow="sm" padding="lg" radius="md" withBorder>
			<Link href={href}>
				<Group justify="space-between" mt="md" mb="xs">
					<Text fw={500}>{title}</Text>
				</Group>

				<Button color="blue" fullWidth mt="md" radius="md">
					移動
				</Button>
			</Link>
		</Card>
	);
}
