"use client";

import React from "react";
import { useActionGuard, type ActionGuardStatus } from "@/hooks/use-action-guard";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@devconsole/ui";
import { AlertCircle, Lock, FlaskConical } from "lucide-react";

interface ActionGuardProps {
  children: React.ReactElement;
  action?: "simulate" | "submit" | "deploy";
  className?: string;
}

/**
 * FE-064: Reusable wrapper that gates interactions based on session state.
 * Shows a descriptive tooltip when the action is blocked.
 */
export function ActionGuard({ children, action = "submit", className }: ActionGuardProps) {
  const guard = useActionGuard();

  const isBlocked = 
    (action === "simulate" && !guard.canSimulate) ||
    ((action === "submit" || action === "deploy") && !guard.canSubmit);

  if (!isBlocked) {
    return React.cloneElement(children);
  }

  const getIcon = () => {
    if (guard.mode === "read-only") return <Lock className="h-4 w-4" />;
    if (guard.mode === "sandbox") return <FlaskConical className="h-4 w-4" />;
    return <AlertCircle className="h-4 w-4" />;
  };

  const getLabel = () => {
    if (guard.mode === "read-only") return "Read-only";
    if (guard.mode === "sandbox") return "Sandbox";
    return "Disconnected";
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={className}>
          {React.cloneElement(children, {
            disabled: true,
            className: `${children.props.className || ""} pointer-events-none opacity-50`,
          })}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[250px] p-3">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 shrink-0 text-amber-500">{getIcon()}</div>
          <div className="space-y-1">
            <p className="font-bold text-xs uppercase tracking-tight">{getLabel()}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {guard.blockedReason}
            </p>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
