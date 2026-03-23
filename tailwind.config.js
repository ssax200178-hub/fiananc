import forms from '@tailwindcss/forms'
import containerQueries from '@tailwindcss/container-queries'

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./hooks/**/*.{js,ts,jsx,tsx}",
        "./services/**/*.{js,ts,jsx,tsx}",
        "./*.{js,ts,jsx,tsx}",
        "./src/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                "primary-green": "#13ec6d",
                "bg-green-light": "#f6f8f7",
                "bg-green-dark": "#102218",
                "surface-green-dark": "#162a1f",
                "primary-blue": "#3b82f6",
                "primary-blue-hover": "#2563eb",
                "match": "#10b981",
                "bg-blue-dark": "#0f172a",
                "surface-blue-dark": "#1e293b",
            },
            fontFamily: {
                "display": ["Inter", "Noto Sans Arabic", "sans-serif"],
                "body": ["Noto Sans Arabic", "Inter", "sans-serif"]
            },
            boxShadow: {
                'glow': '0 0 20px -5px rgba(59, 130, 246, 0.3)',
                'neon': '0 0 10px rgba(19, 236, 109, 0.4)',
            }
        },
    },
    plugins: [forms, containerQueries],
}
