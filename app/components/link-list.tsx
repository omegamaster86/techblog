"use client";

import {
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	closestCorners,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	arrayMove,
	rectSortingStrategy,
	sortableKeyboardCoordinates,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ActionIcon, Button, Card, Group, Text } from "@mantine/core";
import { IconGripVertical, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

type LinkItem = Doc<"links">;

function hasSameOrder(a: LinkItem[], b: LinkItem[]) {
	return (
		a.length === b.length && a.every((item, index) => item._id === b[index]?._id)
	);
}

function SortableLinkCard({
	link,
	onDelete,
}: {
	link: LinkItem;
	onDelete: (id: Id<"links">) => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: link._id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
		zIndex: isDragging ? 1 : 0,
	};

	return (
		<div ref={setNodeRef} style={style} className="touch-none">
			<Card
				shadow="sm"
				padding="lg"
				radius="md"
				withBorder
				className="flex flex-col h-[160px]"
				style={{
					backgroundColor: "rgba(255, 255, 255, 0.2)",
					borderColor: "rgba(255, 255, 255, 0.28)",
					backdropFilter: "blur(14px) saturate(160%)",
					WebkitBackdropFilter: "blur(14px) saturate(160%)",
				}}
			>
				<Group justify="space-between" mt="md" mb="xs" wrap="nowrap">
					<Group gap="xs" wrap="nowrap" className="flex-1 min-w-0">
						<ActionIcon
							variant="subtle"
							color="gray"
							size="sm"
							{...attributes}
							{...listeners}
							aria-label="ドラッグして並び替え"
							className="cursor-grab active:cursor-grabbing shrink-0"
							style={{ touchAction: "none" }}
						>
							<IconGripVertical size={16} color="white" />
						</ActionIcon>
						<Text fw={500} c="white" lineClamp={1} className="flex-1">
							{link.title}
						</Text>
					</Group>
					<ActionIcon
						variant="light"
						color="red"
						size="sm"
						onClick={() => onDelete(link._id)}
						aria-label="削除"
					>
						<IconTrash size={16} />
					</ActionIcon>
				</Group>

				<div className="mt-auto">
					<Link href={link.href} target="_blank" rel="noopener noreferrer">
						<Button color="blue" fullWidth radius="md">
							移動
						</Button>
					</Link>
				</div>
			</Card>
		</div>
	);
}

export function LinkList() {
	const links = useQuery(api.links.list);
	const removeLink = useMutation(api.links.remove);
	const reorderLinks = useMutation(api.links.reorder);
	const [items, setItems] = useState<LinkItem[]>([]);
	const itemsRef = useRef<LinkItem[]>([]);
	const isDraggingRef = useRef(false);

	useEffect(() => {
		if (!links || isDraggingRef.current) return;

		setItems((current) => {
			if (current.length === 0 || !hasSameOrder(current, links)) {
				itemsRef.current = links;
				return links;
			}
			return current;
		});
	}, [links]);

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 8 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleDelete = async (id: Id<"links">) => {
		await removeLink({ id });
	};

	const reorderItems = (activeId: string, overId: string) => {
		const current = itemsRef.current;
		const oldIndex = current.findIndex((link) => link._id === activeId);
		const newIndex = current.findIndex((link) => link._id === overId);
		if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
			return current;
		}

		const next = arrayMove(current, oldIndex, newIndex);
		itemsRef.current = next;
		setItems(next);
		return next;
	};

	const handleDragStart = (_event: DragStartEvent) => {
		isDraggingRef.current = true;
		itemsRef.current = items;
	};

	const handleDragOver = (event: DragOverEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		reorderItems(String(active.id), String(over.id));
	};

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;

		let finalItems = itemsRef.current;
		if (over && active.id !== over.id) {
			finalItems = reorderItems(String(active.id), String(over.id));
		}

		isDraggingRef.current = false;

		if (!links || hasSameOrder(finalItems, links)) return;

		try {
			await reorderLinks({
				orderedIds: finalItems.map((link) => link._id),
			});
		} catch (error) {
			console.error("並び替えの保存に失敗しました:", error);
			setItems(links);
			itemsRef.current = links;
		}
	};

	const handleDragCancel = () => {
		isDraggingRef.current = false;
		if (links) {
			setItems(links);
			itemsRef.current = links;
		}
	};

	if (links === undefined) {
		return <div className="text-white text-center py-8">読み込み中...</div>;
	}

	if (links.length === 0) {
		return (
			<div className="text-white text-center py-8">
				リンクがありません。追加してください。
			</div>
		);
	}

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCorners}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragEnd={handleDragEnd}
			onDragCancel={handleDragCancel}
		>
			<SortableContext
				items={items.map((link) => link._id)}
				strategy={rectSortingStrategy}
			>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
					{items.map((link) => (
						<SortableLinkCard
							key={link._id}
							link={link}
							onDelete={handleDelete}
						/>
					))}
				</div>
			</SortableContext>
		</DndContext>
	);
}
