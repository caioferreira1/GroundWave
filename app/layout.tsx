import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "GroundWave Hub",
  description: "Reddit monitoring, relevance filtering, and AI-assisted content generation.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              classNames: {
                toast: "!bg-card !text-foreground !border-border !shadow-md",
                description: "!text-muted-foreground",
                error: "!text-destructive",
                success: "!text-success",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
