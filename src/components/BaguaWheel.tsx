import React, { useRef, useEffect } from "react";

export default function BaguaWheel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let angle = 0;
    
    // Generate floating glowing particles
    const particles: Array<{ x: number; y: number; r: number; alpha: number; speedY: number; speedX: number }> = [];
    for (let i = 0; i < 30; i++) {
      particles.push({
        x: Math.random() * 200 - 100,
        y: Math.random() * 200 - 100,
        r: Math.random() * 2 + 1,
        alpha: Math.random() * 0.5 + 0.3,
        speedY: -(Math.random() * 0.4 + 0.2),
        speedX: (Math.random() - 0.5) * 0.3,
      });
    }

    const drawTrigram = (
      ctx: CanvasRenderingContext2D,
      type: string,
      x: number,
      y: number,
      size: number,
      rotation: number
    ) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);

      // Gold styling
      ctx.strokeStyle = "#D4AF37";
      ctx.shadowColor = "#FFD700";
      ctx.shadowBlur = 4;
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";

      // 3 bars per trigram
      const barSpacing = size * 0.35;
      const barWidth = size;
      const barHeight = size * 0.18;

      // Define trigram lines: true = solid, false = broken
      let lines: [boolean, boolean, boolean] = [true, true, true];
      if (type === "乾") lines = [true, true, true];
      else if (type === "兑") lines = [false, true, true];
      else if (type === "离") lines = [true, false, true];
      else if (type === "震") lines = [false, false, true];
      else if (type === "巽") lines = [true, true, false];
      else if (type === "坎") lines = [false, true, false];
      else if (type === "艮") lines = [true, false, false];
      else if (type === "坤") lines = [false, false, false];

      lines.forEach((isSolid, idx) => {
        const py = -size * 0.4 + idx * barSpacing;
        if (isSolid) {
          ctx.beginPath();
          ctx.moveTo(-barWidth / 2, py);
          ctx.lineTo(barWidth / 2, py);
          ctx.stroke();
        } else {
          // Left segment
          ctx.beginPath();
          ctx.moveTo(-barWidth / 2, py);
          ctx.lineTo(-barWidth * 0.15, py);
          ctx.stroke();
          // Right segment
          ctx.beginPath();
          ctx.moveTo(barWidth * 0.15, py);
          ctx.lineTo(barWidth / 2, py);
          ctx.stroke();
        }
      });

      ctx.restore();
    };

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height / 2;
      const r = Math.min(cx, cy) - 20;

      ctx.clearRect(0, 0, width, height);

      // 1. Draw Deep Ink Wash Outer Background Plate
      const outerGrad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
      outerGrad.addColorStop(0, "#1F1F1F");
      outerGrad.addColorStop(0.7, "#111111");
      outerGrad.addColorStop(1, "#080808");

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = outerGrad;
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = 15;
      ctx.fill();

      // Outer metallic gold boundary ring
      ctx.strokeStyle = "rgba(212, 175, 55, 0.45)";
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.restore();

      // 2. Inner Golden Oracle Lines
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);

      // Concentric auxiliary rings
      ctx.strokeStyle = "rgba(212, 175, 55, 0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
      ctx.arc(0, 0, r * 0.58, 0, Math.PI * 2);
      ctx.stroke();

      // 8 radiating gold beams
      ctx.strokeStyle = "rgba(212, 175, 55, 0.1)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const beamAngle = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(beamAngle) * r * 0.85, Math.sin(beamAngle) * r * 0.85);
        ctx.stroke();
      }

      // Draw 8 Trigrams
      const trigrams = ["乾", "兑", "离", "震", "巽", "坎", "艮", "坤"];
      trigrams.forEach((name, i) => {
        const trigramAngle = (i * Math.PI) / 4 - Math.PI / 2;
        const tx = Math.cos(trigramAngle) * r * 0.72;
        const ty = Math.sin(trigramAngle) * r * 0.72;
        drawTrigram(ctx, name, tx, ty, r * 0.15, trigramAngle + Math.PI / 2);
      });

      ctx.restore();

      // 3. Draw Center Rotating Taiji (Yin-Yang)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-angle * 1.5); // Reverse direction rotation for inner Taiji

      const taijiR = r * 0.42;

      // Outer boundary and background for Taiji (Black fish base)
      ctx.beginPath();
      ctx.arc(0, 0, taijiR, 0, Math.PI * 2);
      ctx.fillStyle = "#161618";
      ctx.fill();
      
      // Thin, elegant gold stroke around the Taiji outer boundary
      ctx.strokeStyle = "rgba(212, 175, 55, 0.45)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Create Gold Gradient
      const goldGrad = ctx.createLinearGradient(0, -taijiR, 0, taijiR);
      goldGrad.addColorStop(0, "#E6C15C");
      goldGrad.addColorStop(1, "#967520");

      // Draw mathematically perfect Gold Fish half
      ctx.beginPath();
      // Left outer half of the big circle (counter-clockwise)
      ctx.arc(0, 0, taijiR, -Math.PI / 2, Math.PI / 2, true);
      // Lower inner curve (counter-clockwise)
      ctx.arc(0, taijiR / 2, taijiR / 2, Math.PI / 2, -Math.PI / 2, true);
      // Upper inner curve (clockwise)
      ctx.arc(0, -taijiR / 2, taijiR / 2, Math.PI / 2, -Math.PI / 2, false);
      ctx.fillStyle = goldGrad;
      ctx.fill();

      // Draw Top Eye (inside Gold bulb - Black eye)
      ctx.beginPath();
      ctx.arc(0, -taijiR / 2, taijiR / 6, 0, Math.PI * 2);
      ctx.fillStyle = "#161618";
      ctx.fill();

      // Draw Bottom Eye (inside Black bulb - Gold eye)
      ctx.beginPath();
      ctx.arc(0, taijiR / 2, taijiR / 6, 0, Math.PI * 2);
      ctx.fillStyle = goldGrad;
      ctx.fill();

      ctx.restore();

      // 4. Render and update floating mystic particles
      ctx.save();
      ctx.translate(cx, cy);
      particles.forEach((p) => {
        // Rotate with container slightly
        p.y += p.speedY;
        p.x += p.speedX;

        // Reset particle if too high or far
        if (Math.hypot(p.x, p.y) > r * 0.9) {
          p.x = (Math.random() - 0.5) * 80;
          p.y = (Math.random() - 0.5) * 80;
          p.alpha = Math.random() * 0.5 + 0.3;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(230, 193, 92, ${p.alpha})`;
        ctx.shadowColor = "#FFD700";
        ctx.shadowBlur = 6;
        ctx.fill();
      });
      ctx.restore();

      // Slower, meditative rotation
      angle += 0.0035;
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="flex justify-center items-center py-4">
      <div className="relative p-1 rounded-full bg-gradient-to-tr from-[#967520]/20 to-[#E6C15C]/20 shadow-xl shadow-yellow-500/5">
        <canvas
          ref={canvasRef}
          width={300}
          height={300}
          className="w-[260px] h-[260px] sm:w-[280px] sm:h-[280px] block rounded-full"
        />
        <div className="absolute inset-0 rounded-full border border-[#D4AF37]/30 pointer-events-none" />
      </div>
    </div>
  );
}
