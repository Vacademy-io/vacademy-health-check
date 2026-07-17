import { useState } from "react";
import { Building2, ChevronDown, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useInstitutes } from "@/services/institutes-api";

export interface SelectedInstitute {
  id: string;
  name: string;
}

/**
 * Multi-select institute filter. Selections are held by the caller (id + name, so chosen
 * institutes stay labelled even when they fall out of the current search results).
 */
export function InstituteFilter({
  value,
  onChange,
}: {
  value: SelectedInstitute[];
  onChange: (next: SelectedInstitute[]) => void;
}) {
  const [search, setSearch] = useState("");
  const results = useInstitutes(0, 10, search);
  const rows = results.data?.content ?? [];

  const toggle = (inst: SelectedInstitute) => {
    onChange(
      value.some((v) => v.id === inst.id)
        ? value.filter((v) => v.id !== inst.id)
        : [...value, inst]
    );
  };

  const label =
    value.length === 0
      ? "All institutes"
      : value.length === 1
        ? value[0].name
        : `${value.length} institutes`;

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 max-w-56 justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{label}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <div className="p-1.5">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search institutes…"
              className="h-8"
              // Typing inside a menu would otherwise be swallowed by its typeahead.
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>

          {/* Keep selected institutes visible even when the search no longer matches them. */}
          {value.length > 0 ? (
            <>
              {value.map((v) => (
                <DropdownMenuCheckboxItem
                  key={v.id}
                  checked
                  onCheckedChange={() => toggle(v)}
                  onSelect={(e) => e.preventDefault()}
                >
                  <span className="truncate">{v.name}</span>
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
            </>
          ) : null}

          <div className="max-h-56 overflow-y-auto">
            {results.isLoading ? (
              <div className="flex justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : rows.filter((i) => !value.some((v) => v.id === i.id)).length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                {rows.length === 0 ? "No institutes found." : "All matches already selected."}
              </p>
            ) : (
              rows
                .filter((i) => !value.some((v) => v.id === i.id))
                .map((i) => (
                  <DropdownMenuCheckboxItem
                    key={i.id}
                    checked={false}
                    onCheckedChange={() => toggle({ id: i.id, name: i.name })}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span className="truncate">{i.name}</span>
                  </DropdownMenuCheckboxItem>
                ))
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {value.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-2 text-muted-foreground"
          aria-label="Clear institute filter"
          onClick={() => onChange([])}
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
