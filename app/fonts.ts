import { Anek_Tamil, Big_Shoulders, Hanken_Grotesk } from "next/font/google";

// Self-hosted at build time — no request to Google from a visitor's browser.
export const shoulders = Big_Shoulders({ subsets: ["latin"], variable: "--font-shoulders", display: "swap", adjustFontFallback: false });
export const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken", display: "swap" });
// Variable width axis: Tamil headings use the condensed end to sit beside Big Shoulders.
export const anek = Anek_Tamil({ subsets: ["tamil"], axes: ["wdth"], variable: "--font-anek", display: "swap" });

export const fontVariables = `${shoulders.variable} ${hanken.variable} ${anek.variable}`;
