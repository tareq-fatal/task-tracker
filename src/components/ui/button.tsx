import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// TOF-0962 „Calm“: EINE klare Hauptaktion (solid Primary), alles andere tritt
// zurück. Kein Farbverlauf, kein Hochspringen. Auf Touch-Geräten (`coarse:`)
// sind alle Größen mind. 44 px hoch.
const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Mandanten-Branding läuft weiter über --brand-* (Kunden-Report 2026-08, Bug 4).
        default:
          "bg-[hsl(var(--brand-from))] text-[hsl(var(--brand-foreground))] shadow-card hover:bg-[hsl(var(--brand-from)/0.9)]",
        brand:
          "bg-[hsl(var(--brand-from))] text-[hsl(var(--brand-foreground))] shadow-card hover:bg-[hsl(var(--brand-from)/0.9)]",
        solid: "bg-primary text-primary-foreground shadow-card hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-card hover:bg-destructive/90",
        outline:
          "border border-input bg-card text-foreground shadow-card hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 coarse:h-11",
        sm: "h-9 px-3 coarse:h-11",
        lg: "h-11 px-6 text-base",
        icon: "h-10 w-10 coarse:h-11 coarse:w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
