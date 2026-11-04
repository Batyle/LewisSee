/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#2D3765",
        periwinkle: "#92A0D3",
        indigo: "#6A78BC",
        cream: "#F9F6F0",
        white: "#FFFFFF",
        "light-gray": "#F9F6F0",
      },
      borderRadius: { brand: "14px" },
      boxShadow: { brand: "0 4px 12px rgb(45 55 101 / 8%)" },
    },
  },
  plugins: [],
};
