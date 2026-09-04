import { Breadcrumb, type Crumb } from "./Breadcrumb";
import { Button } from "./Button";
import { Plus } from "lucide-react";

type PageHeaderProps = {
  breadcrumb: Crumb[];
  title: string;
  description: string;
  primaryActionLabel: string;
  onPrimaryAction?: () => void;
};

export function PageHeader({
  breadcrumb,
  title,
  description,
  primaryActionLabel,
  onPrimaryAction,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-6">
      <Breadcrumb items={breadcrumb} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {title}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">{description}</p>
        </div>
        <Button onClick={onPrimaryAction} className="shrink-0">
          <Plus size={16} />
          {primaryActionLabel}
        </Button>
      </div>
    </div>
  );
}
