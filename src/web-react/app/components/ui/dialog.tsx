import { XIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "~/lib/utils";

type DialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: React.ReactNode;
};

export function Dialog({ open, onOpenChange, children }: DialogProps) {
	if (!open) return null;
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: overlay click to dismiss */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: overlay click to dismiss */}
			<div
				className="fixed inset-0 bg-black/60 backdrop-blur-sm"
				onClick={() => onOpenChange(false)}
			/>
			<div className="relative z-50 w-full max-w-3xl p-4">{children}</div>
		</div>
	);
}

export function DialogContent({
	className,
	children,
	onClose,
	...props
}: React.ComponentProps<"div"> & { onClose?: () => void }) {
	return (
		<div
			className={cn(
				"relative max-h-[90vh] overflow-auto rounded-xl border bg-background p-6 shadow-lg",
				className,
			)}
			{...props}
		>
			{children}
			{onClose ? (
				<button
					type="button"
					onClick={onClose}
					className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100"
					aria-label="Close"
				>
					<XIcon className="size-4" />
				</button>
			) : null}
		</div>
	);
}

export function DialogHeader({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex flex-col gap-1.5 text-center sm:text-left",
				className,
			)}
			{...props}
		/>
	);
}

export function DialogTitle({
	className,
	...props
}: React.ComponentProps<"h2">) {
	return (
		<h2
			className={cn(
				"text-lg font-semibold leading-none tracking-tight",
				className,
			)}
			{...props}
		/>
	);
}

export function DialogDescription({
	className,
	...props
}: React.ComponentProps<"p">) {
	return (
		<p className={cn("text-sm text-muted-foreground", className)} {...props} />
	);
}

export function DialogFooter({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
				className,
			)}
			{...props}
		/>
	);
}
