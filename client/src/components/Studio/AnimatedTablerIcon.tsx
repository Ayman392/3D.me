// "use client";

// import React from "react";
// import { motion } from "framer-motion";
// import type { IconProps } from "@tabler/icons-react";

// interface AnimatedTablerIconProps {
//   icon: React.ComponentType<IconProps>;
//   isActive?: boolean;
//   isSpinning?: boolean;
//   className?: string;
//   size?: number;
//   stroke?: number;
// }

// export function AnimatedTablerIcon({
//   icon: Icon,
//   isActive = false,
//   isSpinning = false,
//   className = "h-4 w-4",
//   size = 18,
//   stroke = 1.75,
// }: AnimatedTablerIconProps) {
//   return (
//     <motion.span
//       className={`inline-flex shrink-0 items-center justify-center ${className}`}
//       animate={
//         isSpinning
//           ? { rotate: 360 }
//           : isActive
//             ? { scale: 1.08, y: -1 }
//             : { scale: 1, y: 0 }
//       }
//       transition={
//         isSpinning
//           ? { repeat: Infinity, duration: 1.4, ease: "linear" }
//           : { type: "spring", stiffness: 420, damping: 24 }
//       }
//       whileHover={{ scale: 1.16, rotate: isSpinning ? undefined : 4 }}
//       whileTap={{ scale: 0.9 }}
//     >
//       <Icon size={size} stroke={stroke} />
//     </motion.span>
//   );
// }
