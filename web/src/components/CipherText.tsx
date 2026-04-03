"use client";

import { useRef, useEffect, useCallback } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%^&*()_+-=[]{}|;:,.<>?/~`ΣΔΩπλμφψξ∞≈≠±∫∂√";
const COLS = 40;
const ROWS = 30;

export default function CipherText() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1, y: -1 });
  const gridRef = useRef<string[][]>([]);
  const velocityRef = useRef<number[][]>([]);

  // Initialize grid
  useEffect(() => {
    const grid: string[][] = [];
    const vel: number[][] = [];
    for (let r = 0; r < ROWS; r++) {
      grid[r] = [];
      vel[r] = [];
      for (let c = 0; c < COLS; c++) {
        grid[r][c] = CHARS[Math.floor(Math.random() * CHARS.length)];
        vel[r][c] = 0;
      }
    }
    gridRef.current = grid;
    velocityRef.current = vel;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cellW = w / COLS;
    const cellH = h / ROWS;
    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;

    ctx.clearRect(0, 0, w, h);

    const grid = gridRef.current;
    const vel = velocityRef.current;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cx = c * cellW + cellW / 2;
        const cy = r * cellH + cellH / 2;

        // Distance from cursor
        const dx = mx - cx;
        const dy = my - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const radius = 120;

        // Scramble speed based on proximity
        if (dist < radius && mx >= 0) {
          vel[r][c] = Math.min(vel[r][c] + 0.3, 1);
        } else {
          vel[r][c] *= 0.95;
        }

        // Scramble character
        if (vel[r][c] > 0.1 || Math.random() < 0.002) {
          grid[r][c] = CHARS[Math.floor(Math.random() * CHARS.length)];
        }

        // Offset based on cursor proximity
        let offX = 0;
        let offY = 0;
        if (dist < radius && dist > 0 && mx >= 0) {
          const force = (1 - dist / radius) * 8;
          offX = (dx / dist) * -force;
          offY = (dy / dist) * -force;
        }

        // Opacity based on velocity
        const alpha = 0.08 + vel[r][c] * 0.4;

        ctx.font = `${Math.floor(cellH * 0.7)}px "SF Pro Mono", "SF Mono", "Fira Code", monospace`;
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(grid[r][c], cx + offX, cy + offY);
      }
    }
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
    };
    resize();
    window.addEventListener("resize", resize);

    let animId: number;
    const loop = () => {
      draw();
      animId = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, [draw]);

  // Mouse tracking relative to canvas
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseRef.current.x = (e.clientX - rect.left) * 2;
    mouseRef.current.y = (e.clientY - rect.top) * 2;
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current.x = -1;
    mouseRef.current.y = -1;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    />
  );
}
