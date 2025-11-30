// client/postcss.config.js
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

export default {
  plugins: [
    tailwindcss({
      // 明確指定使用同目錄下的 tailwind 設定（ts 版也 OK）
      config: "./tailwind.config.ts",
    }),
    autoprefixer,
  ],
};
