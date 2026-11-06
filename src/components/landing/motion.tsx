"use client";

import { MotionConfig, motion, type Variants } from "motion/react";
import type { ReactNode } from "react";

/** The landing page's easing: quick out, soft landing. */
export const EASE = [0.22, 1, 0.36, 1] as const;

/** Wraps the landing page so every animation honours prefers-reduced-motion. */
export function LandingMotion({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.5, ease: EASE }}>
      {children}
    </MotionConfig>
  );
}

const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  shown: { opacity: 1, y: 0 },
};

/** Fades and lifts its content once, as it scrolls into view. */
export function InView({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li" | "section" | "header";
}) {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      variants={rise}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.55, ease: EASE, delay: delay / 1000 }}
    >
      {children}
    </Tag>
  );
}

/** A list whose items rise in sequence as it scrolls into view. */
export function Stagger({ children, className, gap = 0.07 }: { children: ReactNode; className?: string; gap?: number }) {
  return (
    <motion.ul
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ staggerChildren: gap }}
    >
      {children}
    </motion.ul>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.li className={className} variants={rise} transition={{ duration: 0.5, ease: EASE }}>
      {children}
    </motion.li>
  );
}
