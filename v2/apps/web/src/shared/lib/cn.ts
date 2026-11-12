import { clsx, type ClassValue } from "clsx";

/**
 * Class names joined. Unlike shadcn's default this does NOT resolve two Tailwind classes of the
 * same kind ("px-4 px-6") — tailwind-merge costs 7 kB in the start script. So: a component's own
 * classes and the `className` passed in must not set the same property; use a variant instead.
 */
export const cn = (...inputs: ClassValue[]) => clsx(inputs);
