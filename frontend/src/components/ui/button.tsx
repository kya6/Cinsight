import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

// Variants follow the Figma components: "btn pri" (default), "btn gh" (outline)
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-14 whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-brand font-medium text-on-brand hover:bg-brand/85",
        outline:
          "border-ghost bg-transparent font-semibold text-ink-button hover:bg-surface hover:text-ink aria-expanded:bg-surface aria-pressed:bg-surface",
        secondary: "bg-chip font-medium text-ink hover:bg-chip-2",
        ghost: "font-medium text-ink-2 hover:bg-chip/60 hover:text-ink aria-expanded:bg-chip/60",
        destructive: "bg-high-bg font-medium text-high hover:bg-high-bg-2",
        link: "font-semibold text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11.5 gap-1.75 px-4",
        md: "h-9.5 gap-1.5 px-4.5",
        sm: "h-8 gap-1 px-3 text-13",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
