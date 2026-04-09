// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: MIT

import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  what: string;
  why: string;
  action?: ReactNode;
}

export default function EmptyState({
  icon: Icon,
  title,
  what,
  why,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <Icon size={28} className="text-primary" />
      </div>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {what}
      </p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground/70">
        {why}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
