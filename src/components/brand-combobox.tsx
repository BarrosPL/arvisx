"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface BrandComboboxOption {
  id: string;
  name: string;
}

const UNASSIGNED_VALUE = "__unassigned__";

export function BrandCombobox({
  brands,
  value,
  onSelect,
  disabled,
  placeholder = "Não atribuída",
}: {
  brands: BrandComboboxOption[];
  value: string | null;
  onSelect: (brandId: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = brands.find((brand) => brand.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "w-52 justify-between font-normal"
        )}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar marca..." />
          <CommandList>
            <CommandEmpty>Nenhuma marca encontrada.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={UNASSIGNED_VALUE}
                onSelect={() => {
                  onSelect(null);
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 size-4", !value ? "opacity-100" : "opacity-0")} />
                Não atribuída
              </CommandItem>
              {brands.map((brand) => (
                <CommandItem
                  key={brand.id}
                  value={brand.name}
                  onSelect={() => {
                    onSelect(brand.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 size-4", value === brand.id ? "opacity-100" : "opacity-0")} />
                  {brand.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
