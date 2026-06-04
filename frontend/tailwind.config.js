const config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { 50: "#EEF3FF", 100: "#D4E2FC", 200: "#A9C5F9", 300: "#7DA8F6", 400: "#528BF3", 500: "#2562EB", 600: "#1E4EBC", 700: "#163A8D", 800: "#0F275E", 900: "#07132F" },
        success: { 50: "#F0FFF4", 500: "#07A577", 600: "#059669" },
        warning: { 50: "#FFFBEB", 500: "#EF9E1E", 600: "#D97706" },
        danger: { 50: "#FFF5F5", 500: "#E82828", 600: "#DC2626" },
        gray: { 100: "#F9FBFD", 200: "#F4F8FD", 300: "#FFFFFF", 500: "#8E99AA", 600: "#727C8E", 700: "#3F495B", 800: "#2D333F" },
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"], mono: ["JetBrains Mono", "Fira Code", "monospace"] },
      fontSize: {
        "11": ["11px", { lineHeight: "16px" }], "12": ["12px", { lineHeight: "16px" }], "13": ["13px", { lineHeight: "20px" }],
        "14": ["14px", { lineHeight: "20px" }], "15": ["15px", { lineHeight: "22px" }], "16": ["16px", { lineHeight: "24px" }],
        "17": ["17px", { lineHeight: "24px" }], "18": ["18px", { lineHeight: "26px" }], "20": ["20px", { lineHeight: "28px" }],
        "22": ["22px", { lineHeight: "30px" }], "24": ["24px", { lineHeight: "32px" }], "26": ["26px", { lineHeight: "36px" }],
        "28": ["28px", { lineHeight: "38px" }], "30": ["30px", { lineHeight: "40px" }], "34": ["34px", { lineHeight: "46px" }],
        "40": ["40px", { lineHeight: "52px" }], "48": ["48px", { lineHeight: "60px" }], "52": ["52px", { lineHeight: "64px" }], "62": ["62px", { lineHeight: "76px" }],
      },
      borderRadius: { xs: "2px", sm: "4px", md: "6px", lg: "8px", xl: "12px", "2xl": "16px", "3xl": "20px", full: "9999px" },
      spacing: { "0.5": "2px", "1": "4px", "1.5": "6px", "2": "8px", "2.5": "10px", "3": "12px", "3.5": "14px", "4": "16px", "5": "20px", "6": "24px", "8": "32px", "10": "40px", "12": "48px", "16": "64px" },
      boxShadow: { xs: "0 1px 2px rgba(0,0,0,0.05)", sm: "0 1px 3px rgba(0,0,0,0.08)", md: "0 4px 6px rgba(0,0,0,0.07)", lg: "0 10px 15px rgba(0,0,0,0.08)", xl: "0 20px 25px rgba(0,0,0,0.10)" },
      animation: { "fade-in": "fadeIn 0.2s ease-out", "slide-up": "slideUp 0.3s ease-out", "slide-in-right": "slideInRight 0.3s ease-out", "scale-in": "scaleIn 0.2s ease-out" },
      keyframes: { fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } }, slideUp: { "0%": { transform: "translateY(10px)", opacity: "0" }, "100%": { transform: "translateY(0)", opacity: "1" } }, slideInRight: { "0%": { transform: "translateX(100%)" }, "100%": { transform: "translateX(0)" } }, scaleIn: { "0%": { transform: "scale(0.95)", opacity: "0" }, "100%": { transform: "scale(1)", opacity: "1" } } },
    },
  },
  plugins: [],
}
export default config
