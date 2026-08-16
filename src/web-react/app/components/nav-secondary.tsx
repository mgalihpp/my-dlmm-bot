"use client";

import type * as React from "react";
import { NavLink } from "react-router";

import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "~/components/ui/sidebar";

export function NavSecondary({
	items,
	...props
}: {
	items: {
		title: string;
		url: string;
		icon: React.ReactNode;
	}[];
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
	return (
		<SidebarGroup {...props}>
			<SidebarGroupContent>
				<SidebarMenu>
					{items.map((item) => (
						<SidebarMenuItem key={item.title}>
							<SidebarMenuButton asChild>
								{item.url.startsWith("#") ? (
									<a href={item.url}>
										{item.icon}
										<span>{item.title}</span>
									</a>
								) : (
									<NavLink to={item.url} prefetch="intent">
										{item.icon}
										<span>{item.title}</span>
									</NavLink>
								)}
							</SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
