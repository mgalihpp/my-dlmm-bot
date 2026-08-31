import { ChevronRightIcon, LogOutIcon } from "lucide-react";
import { Link, useOutletContext } from "react-router";
import { ProfileCard } from "~/components/settings/profile-card";
import { SECTIONS } from "~/components/settings/settings-meta";
import type { SettingsPayload } from "~/lib/settings";

export default function SettingsIndex() {
	const { data } = useOutletContext<{
		data: SettingsPayload;
	}>();
	const groups = [...new Set(SECTIONS.map((section) => section.group))];
	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 md:py-8">
			<div>
				<h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Manage Vexis from one place.
				</p>
			</div>
			<ProfileCard wallet={data.wallet} rpc={data.rpc} />
			<div className="flex flex-col gap-6">
				{groups.map((group) => (
					<section key={group}>
						<h2 className="mb-2 px-1 text-sm font-medium text-muted-foreground">
							{group}
						</h2>
						<div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
							{SECTIONS.filter((section) => section.group === group).map(
								({ key, title, description, icon: Icon }, index, rows) => (
									<Link
										key={key}
										to={key}
										className={`group flex items-center gap-3 px-4 py-4 transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset ${index < rows.length - 1 ? "border-b border-border/60" : ""}`}
									>
										<span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
											<Icon className="size-[18px]" />
										</span>
										<span className="min-w-0 flex-1">
											<span className="block font-medium">{title}</span>
											<span className="mt-0.5 block truncate text-xs text-muted-foreground">
												{key === "agent"
													? data.agent.enabled
														? data.agent.running
															? "Running"
															: "Idle"
														: "Stopped"
													: description}
											</span>
										</span>
										<ChevronRightIcon className="size-5 shrink-0 text-muted-foreground/70" />
									</Link>
								),
							)}
						</div>
					</section>
				))}
				<Link
					to="/logout"
					className="flex items-center justify-center gap-2 rounded-2xl border border-destructive/20 bg-card py-4 font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					<LogOutIcon className="size-4" />
					Log out
				</Link>
			</div>
		</div>
	);
}
