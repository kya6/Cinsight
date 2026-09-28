import { createCn } from "cn/config";

/**
 * clsx + tailwind-merge, taught the Cinsight tokens from globals.css. Without this, numeric
 * font sizes like `text-12` look like colours and get dropped next to `text-ink`.
 */
export const cn = createCn({
  extend: {
    theme: { radius: ["3", "5", "7", "12", "card"] },
    classGroups: {
      "font-size": [{ text: ["10", "11", "12", "13", "14", "16", "26", "28", "30", "34"] }],
      tracking: [{ tracking: ["label"] }],
    },
  },
});
