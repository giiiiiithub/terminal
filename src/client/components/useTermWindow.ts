/**
 * useTermWindow — dock/float window geometry for the terminal panel: height
 * state, the dock-avail ceiling, the floating overlay rect, and the drag /
 * resize gesture handling. Extracted from TerminalPanel so the panel can focus
 * on terminal concerns (sessions, shell/cwd selection, tabs).
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Drag interactions: dock top grip or float move/eight-direction resize. */
export type DragMode =
  | "dock-top"
  | "float-move"
  | "float-n"
  | "float-s"
  | "float-e"
  | "float-w"
  | "float-ne"
  | "float-nw"
  | "float-se"
  | "float-sw";

export interface FloatRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TermWindow {
  /** Callback ref to attach to the panel element (keeps the RefObject internal). */
  setPanelRef(node: HTMLDivElement | null): void;
  panelHeight: number;
  isMaximized: boolean;
  isFloating: boolean;
  floatRect: FloatRect;
  dockAvail: number;
  beginDrag(mode: DragMode): (event: React.MouseEvent) => void;
  enterFloat(): void;
  dockWindow(): void;
  minimize(): void;
  toggleMaximize(): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Nearest scrollable ancestor (the chat feed scroll container). */
function findScrollAncestor(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node !== null) {
    const style = getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(style.overflowY)) return node;
    node = node.parentElement;
  }
  return null;
}

export function useTermWindow(isOpen: boolean): TermWindow {
  const [panelHeight, setPanelHeight] = useState(340);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFloating, setIsFloating] = useState(false);
  const [floatRect, setFloatRect] = useState<FloatRect>({ x: 24, y: 24, w: 960, h: 640 });
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    height: number;
    rect: FloatRect;
    /** Restores the scroll-lock listener installed at drag start. */
    scrollCleanup?: () => void;
  } | null>(null);
  const [dockAvail, setDockAvail] = useState(0);
  const dockAvailRef = useRef(0);

  // Measure how tall the panel may grow before the dock layout gives way. The
  // host page pins the composer seat to the bottom of the scroll container
  // with position:sticky (position:absolute when a composer overlay is up);
  // sticky can only hold the bottom while the seat is no taller than the
  // scrollport. The seat holds the panel plus "chrome" (todo/goal strips,
  // gaps, the composer), so the panel's ceiling is scrollport - chrome. Track
  // it live so window resizes, strip appearances, and composer growth all
  // re-clamp the panel instead of pushing its bottom off-screen.
  useLayoutEffect(() => {
    if (isFloating || !isOpen) return;
    const panel = panelRef.current;
    if (panel === null) return;
    const scrollHost = findScrollAncestor(panel);
    let seat: HTMLElement | null = panel.parentElement;
    while (seat !== null) {
      const position = getComputedStyle(seat).position;
      if (position === "sticky" || position === "absolute") break;
      seat = seat.parentElement;
    }
    const measure = (): void => {
      if (scrollHost === null || seat === null) return;
      const chrome = seat.offsetHeight - panel.offsetHeight;
      // The seat must stay STRICTLY shorter than the scrollport or the sticky
      // pin lets go at the boundary (2px safety margin). No 160px floor here:
      // in a short viewport the panel shrinks below 160 instead of letting
      // the seat overflow, which would flip the sticky regime and make the
      // panel's bottom edge jump around. 32px keeps a draggable sliver alive.
      const avail = Math.max(32, Math.round(scrollHost.clientHeight - chrome) - 2);
      dockAvailRef.current = avail;
      setDockAvail((current) => (current === avail ? current : avail));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (scrollHost !== null) observer.observe(scrollHost);
    if (seat !== null) observer.observe(seat);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [isFloating, isOpen]);

  // Drop any lingering drag listeners when the window state unmounts.
  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", onDragMove);
      window.removeEventListener("mouseup", endDrag);
    };
  }, []);

  function beginDrag(mode: DragMode) {
    return (event: React.MouseEvent): void => {
      if (event.button !== 0) return;
      event.preventDefault();
      const dragState: NonNullable<typeof dragRef.current> = {
        mode,
        startX: event.clientX,
        startY: event.clientY,
        // Start from the rendered height: the panel may be maximized or
        // clamped by the dock-avail ceiling, and the grip must follow the
        // mouse from where it actually is.
        height:
          mode === "dock-top"
            ? (panelRef.current?.offsetHeight ?? panelHeight)
            : panelHeight,
        rect: floatRect
      };
      if (mode === "dock-top") {
        // The grip starts from the rendered height (see dragState.height), so
        // leave maximize mode for the drag to take effect immediately.
        setIsMaximized(false);
        // The chat feed auto-scrolls to the bottom whenever content grows; the
        // growing panel would get scrolled up with it. Pin the scroll position
        // for the duration of a dock-grip drag.
        const scrollHost = findScrollAncestor(panelRef.current);
        if (scrollHost !== null) {
          const locked = scrollHost.scrollTop;
          const onScroll = (): void => {
            if (scrollHost.scrollTop !== locked) scrollHost.scrollTop = locked;
          };
          scrollHost.addEventListener("scroll", onScroll);
          dragState.scrollCleanup = () => scrollHost.removeEventListener("scroll", onScroll);
        }
      }
      dragRef.current = dragState;
      window.addEventListener("mousemove", onDragMove);
      window.addEventListener("mouseup", endDrag);
    };
  }

  function onDragMove(event: MouseEvent): void {
    const drag = dragRef.current;
    if (drag === null) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.mode === "dock-top") {
      // Same as git-ui: dragging the top grip changes the panel height —
      // UP (dy < 0) grows it, DOWN shrinks it. Nothing else moves.
      // The ceiling is the measured dock room (scrollport minus the seat's
      // chrome); growing past it would make the sticky seat taller than the
      // scrollport and detach the panel's bottom edge from the anchor.
      const heightMax = Math.min(
        Math.round(window.innerHeight * 0.85),
        dockAvailRef.current > 0 ? dockAvailRef.current : Number.POSITIVE_INFINITY
      );
      const heightMin =
        dockAvailRef.current > 0 ? Math.min(160, dockAvailRef.current) : 160;
      setPanelHeight(clamp(drag.height - dy, heightMin, heightMax));
      return;
    }
    if (drag.mode === "float-move") {
      setFloatRect({
        x: clamp(drag.rect.x + dx, -(drag.rect.w - 120), window.innerWidth - 80),
        y: clamp(drag.rect.y + dy, 0, window.innerHeight - 60),
        w: drag.rect.w,
        h: drag.rect.h
      });
      return;
    }
    // eight-direction resize
    let x = drag.rect.x;
    let y = drag.rect.y;
    let w = drag.rect.w;
    let h = drag.rect.h;
    const minW = 320;
    const minH = 200;
    if (drag.mode.includes("e")) w = clamp(drag.rect.w + dx, minW, window.innerWidth);
    if (drag.mode.includes("s")) h = clamp(drag.rect.h + dy, minH, window.innerHeight);
    if (drag.mode.includes("w")) {
      const nw = clamp(drag.rect.w - dx, minW, window.innerWidth);
      x = drag.rect.x + (drag.rect.w - nw);
      w = nw;
    }
    if (drag.mode.includes("n")) {
      const nh = clamp(drag.rect.h - dy, minH, window.innerHeight);
      y = drag.rect.y + (drag.rect.h - nh);
      h = nh;
    }
    setFloatRect({ x, y, w, h });
  }

  function endDrag(): void {
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", endDrag);
    dragRef.current?.scrollCleanup?.();
    dragRef.current = null;
  }

  /** Enter float mode at near-viewport size ("maximized" presentation). */
  function enterFloat(): void {
    const w = Math.max(640, window.innerWidth - 48);
    const h = Math.max(400, window.innerHeight - 48);
    setFloatRect({ x: Math.round((window.innerWidth - w) / 2), y: 24, w, h });
    setIsFloating(true);
  }

  function dockWindow(): void {
    setIsFloating(false);
  }

  /** Leave float/maximize state; the caller decides whether to also close. */
  function minimize(): void {
    setIsFloating(false);
    setIsMaximized(false);
  }

  function toggleMaximize(): void {
    setIsMaximized((value) => !value);
  }

  return {
    setPanelRef: (node: HTMLDivElement | null) => {
      panelRef.current = node;
    },
    panelHeight,
    isMaximized,
    isFloating,
    floatRect,
    dockAvail,
    beginDrag,
    enterFloat,
    dockWindow,
    minimize,
    toggleMaximize
  };
}
