import type { Metadata } from "next";
import "./globals.css";
import { SidebarProvider, SidebarInset, TooltipProvider } from "@devconsole/ui";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";
import { CommandPalette } from "@/components/command-palette";
import { fetchRuntimeConfig } from "@/lib/api/runtime-config";

export const metadata: Metadata = {
  title: "Soroban DevConsole",
  description: "Developer toolkit for Soroban smart contracts",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const runtimeConfig = await fetchRuntimeConfig();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Inline runtime config so client components can read it synchronously */}
        <script
          id="__runtime_config__"
          type="application/json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(runtimeConfig) }}
        />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
          enableSystem
        >
          <SidebarProvider>
            <TooltipProvider>
              <AppSidebar />
              <SidebarInset>
                <SiteHeader />
                <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
                  {children}
                  <CommandPalette />
                </div>
              </SidebarInset>
            </TooltipProvider>
          </SidebarProvider>
        </ThemeProvider>

        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
