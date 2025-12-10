"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu } from "lucide-react";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface HeaderProps {
  onScrollToSubmission?: () => void;
  isHomepage?: boolean;
}

export function Header({ onScrollToSubmission, isHomepage = false }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur-sm">
      <div className="container mx-auto px-6 md:px-12 max-w-6xl">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Image
              src="/logo.webp"
              alt="AB Jail logo"
              width={32}
              height={32}
              className="w-8 h-8 rounded-md"
            />
            <span className="font-semibold tracking-tight text-lg text-foreground">AB Jail</span>
            <span className="hidden md:inline-flex px-2 py-0.5 rounded-full bg-secondary text-[10px] uppercase tracking-wider font-medium text-secondary-foreground ml-0">
              Beta
            </span>
          </Link>

          {/* Desktop Navigation */}
          <NavigationMenu className="hidden md:flex" viewport={false}>
            <NavigationMenuList className="gap-1">
              <NavigationMenuItem>
                <NavigationMenuTrigger className="bg-transparent text-muted-foreground hover:text-foreground hover:bg-transparent data-[state=open]:bg-transparent">
                  Cases
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-48 gap-1 p-2">
                    <li>
                      <NavigationMenuLink asChild>
                        <Link
                          href="/cases"
                          className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                          <div className="text-sm font-medium">All Messages</div>
                        </Link>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink asChild>
                        <Link
                          href="/cases?codes=ANY_VIOLATION"
                          className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                          <div className="text-sm font-medium">Detected Violations</div>
                        </Link>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink asChild>
                        <Link
                          href="/reports"
                          className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                          <div className="text-sm font-medium">Reports to ActBlue</div>
                        </Link>
                      </NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>

              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <Link
                    href="/stats"
                    className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Statistics
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>

              <NavigationMenuItem>
                <NavigationMenuTrigger className="bg-transparent text-muted-foreground hover:text-foreground hover:bg-transparent data-[state=open]:bg-transparent">
                  About
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-48 gap-1 p-2">
                    <li>
                      <NavigationMenuLink asChild>
                        <Link
                          href="/welcome"
                          className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                          <div className="text-sm font-medium">How it Works</div>
                        </Link>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink asChild>
                        <Link
                          href="/stats"
                          className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                          <div className="text-sm font-medium">Stats and Data</div>
                        </Link>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink asChild>
                        <Link
                          href="/evaluation"
                          className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                          <div className="text-sm font-medium">AI Training</div>
                        </Link>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink asChild>
                        <Link
                          href="/about"
                          className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                          <div className="text-sm font-medium">Contact</div>
                        </Link>
                      </NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>

          {/* Right side buttons and mobile menu */}
          <div className="flex items-center gap-4">
            {isHomepage && onScrollToSubmission && (
              <button 
                onClick={onScrollToSubmission}
                className="hidden md:inline-flex border border-primary text-primary bg-background/50 px-4 py-2 text-sm font-medium rounded-sm hover:bg-primary/5 transition-colors backdrop-blur-sm"
              >
                Submit Evidence
              </button>
            )}

            {/* Mobile Navigation */}
            <Sheet>
              <SheetTrigger asChild>
                <button className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors">
                  <Menu className="w-5 h-5" />
                  <span className="sr-only">Open menu</span>
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="bg-background text-foreground">
                <SheetHeader>
                  <SheetTitle className="text-left text-foreground">Menu</SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-6 mt-6 px-2">
                  {isHomepage && onScrollToSubmission && (
                    <button 
                      onClick={() => {
                        onScrollToSubmission();
                      }}
                      className="w-full border border-primary text-primary bg-background/50 px-4 py-3 text-sm font-medium rounded-sm hover:bg-primary/5 transition-colors"
                    >
                      Submit Evidence
                    </button>
                  )}

                  <div className="space-y-3">
                    <h3 className="font-medium text-sm text-foreground">Cases</h3>
                    <ul className="space-y-2 pl-3">
                      <li>
                        <Link href="/cases" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                          All Messages
                        </Link>
                      </li>
                      <li>
                        <Link href="/cases?codes=ANY_VIOLATION" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                          Detected Violations
                        </Link>
                      </li>
                      <li>
                        <Link href="/reports" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                          Reports to ActBlue
                        </Link>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <Link href="/stats" className="font-medium text-sm text-foreground hover:text-primary transition-colors">
                      Statistics
                    </Link>
                  </div>
                  <div className="space-y-3">
                    <h3 className="font-medium text-sm text-foreground">About</h3>
                    <ul className="space-y-2 pl-3">
                      <li>
                        <Link href="/welcome" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                          How it Works
                        </Link>
                      </li>
                      <li>
                        <Link href="/stats" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                          Stats and Data
                        </Link>
                      </li>
                      <li>
                        <Link href="/evaluation" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                          AI Training
                        </Link>
                      </li>
                      <li>
                        <Link href="/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                          Contact
                        </Link>
                      </li>
                    </ul>
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}

