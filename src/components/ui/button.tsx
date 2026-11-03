import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl text-sm font-medium transition-[background,color,box-shadow,transform] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-electric text-white hover:bg-electric/90 shadow-sm",
        secondary: "bg-surface-2 text-fg hover:bg-mist dark:hover:bg-deep/80",
        ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
        outline: "border border-line bg-transparent text-fg hover:bg-surface-2",
        float: "glass border border-line text-fg shadow-float hover:text-electric dark:hover:text-turquoise",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 px-2.5 text-xs",
        icon: "size-9",
        "icon-sm": "size-8",
      },
      active: { true: "", false: "" },
    },
    compoundVariants: [
      { variant: "float", active: true, class: "text-electric dark:text-turquoise ring-1 ring-electric/30 dark:ring-turquoise/30" },
      { variant: "ghost", active: true, class: "bg-surface-2 text-fg" },
    ],
    defaultVariants: { variant: "default", size: "default", active: false },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, active, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size, active }), className)} {...props} />
));
Button.displayName = "Button";
