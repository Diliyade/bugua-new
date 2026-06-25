import React, { useRef, useEffect, useState } from "react";

interface OctahedronDieProps {
  isRolling: boolean;
  targetValue: number | null; // 1 to 8, or null
  onRollComplete?: (value: number) => void;
}

const TRIGRAM_LABELS = [
  "乾一", "兑二", "离三", "震四",
  "巽五", "坎六", "艮七", "坤八"
];

const TRIGRAM_SYMBOLS = [
  "☰", "☱", "☲", "☳",
  "☴", "☵", "☶", "☷"
];

// 3D Point projection helper
interface Point3D {
  x: number;
  y: number;
  z: number;
}

export default function OctahedronDie({ isRolling, targetValue, onRollComplete }: OctahedronDieProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotationRef = useRef({ x: 0.5, y: 0.5, z: 0.2 });
  const speedRef = useRef({ x: 0.02, y: 0.015, z: 0.01 });
  const rollTimerRef = useRef<number | null>(null);
  const [displayedValue, setDisplayedValue] = useState<string>("请诚心起卦");

  // Octahedron vertices
  const vertices: Point3D[] = [
    { x: 0, y: 1.2, z: 0 },    // Top vertex (A)
    { x: 1, y: 0, z: 1 },      // Front-Right (B)
    { x: -1, y: 0, z: 1 },     // Front-Left (C)
    { x: -1, y: 0, z: -1 },    // Back-Left (D)
    { x: 1, y: 0, z: -1 },     // Back-Right (E)
    { x: 0, y: -1.2, z: 0 },   // Bottom vertex (F)
  ];

  // 8 Faces (vertex indices)
  // Each face corresponds to one trigram
  const faces = [
    { indices: [0, 1, 2], label: TRIGRAM_LABELS[0], symbol: TRIGRAM_SYMBOLS[0], id: 1 }, // 乾
    { indices: [0, 2, 3], label: TRIGRAM_LABELS[1], symbol: TRIGRAM_SYMBOLS[1], id: 2 }, // 兑
    { indices: [0, 3, 4], label: TRIGRAM_LABELS[2], symbol: TRIGRAM_SYMBOLS[2], id: 3 }, // 离
    { indices: [0, 4, 1], label: TRIGRAM_LABELS[3], symbol: TRIGRAM_SYMBOLS[3], id: 4 }, // 震
    { indices: [5, 2, 1], label: TRIGRAM_LABELS[4], symbol: TRIGRAM_SYMBOLS[4], id: 5 }, // 巽
    { indices: [5, 3, 2], label: TRIGRAM_LABELS[5], symbol: TRIGRAM_SYMBOLS[5], id: 6 }, // 坎
    { indices: [5, 4, 3], label: TRIGRAM_LABELS[6], symbol: TRIGRAM_SYMBOLS[6], id: 7 }, // 艮
    { indices: [5, 1, 4], label: TRIGRAM_LABELS[7], symbol: TRIGRAM_SYMBOLS[7], id: 8 }, // 坤
  ];

  // Rotate a point in 3D
  const rotatePoint = (p: Point3D, rx: number, ry: number, rz: number): Point3D => {
    // Rotate Z
    let x1 = p.x * Math.cos(rz) - p.y * Math.sin(rz);
    let y1 = p.x * Math.sin(rz) + p.y * Math.cos(rz);
    let z1 = p.z;

    // Rotate Y
    let x2 = x1 * Math.cos(ry) + z1 * Math.sin(ry);
    let y2 = y1;
    let z2 = -x1 * Math.sin(ry) + z1 * Math.cos(ry);

    // Rotate X
    let x3 = x2;
    let y3 = y2 * Math.cos(rx) - z2 * Math.sin(rx);
    let z3 = y2 * Math.sin(rx) + z2 * Math.cos(rx);

    return { x: x3, y: y3, z: z3 };
  };

  useEffect(() => {
    let animationId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const scale = Math.min(width, height) * 0.35;
      const center = { x: width / 2, y: height / 2 };

      // Update rotation
      rotationRef.current.x += speedRef.current.x;
      rotationRef.current.y += speedRef.current.y;
      rotationRef.current.z += speedRef.current.z;

      // Project vertices
      const projected = vertices.map(v => {
        const r = rotatePoint(v, rotationRef.current.x, rotationRef.current.y, rotationRef.current.z);
        // Orthographic projection
        return {
          x: center.x + r.x * scale,
          y: center.y - r.y * scale, // invert Y
          z: r.z
        };
      });

      // Calculate face details and sort by average Z (for back-face culling/painter's algorithm)
      const faceDetails = faces.map(face => {
        const pts = face.indices.map(idx => projected[idx]);
        const avgZ = (pts[0].z + pts[1].z + pts[2].z) / 3;

        // Calculate face normal vector to check if facing the viewer (Z > 0)
        const v1 = { x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y };
        const v2 = { x: pts[2].x - pts[0].x, y: pts[2].y - pts[0].y };
        // Cross product Z-component
        const crossZ = v1.x * v2.y - v1.y * v2.x;

        return {
          face,
          pts,
          avgZ,
          isFront: crossZ > 0
        };
      });

      // Sort back-to-front
      faceDetails.sort((a, b) => a.avgZ - b.avgZ);

      // Draw faces
      faceDetails.forEach(({ face, pts, isFront }) => {
        if (!isFront) return; // Simple back-face culling

        // Base color shading based on Z position to simulate 3D depth and light
        const normalZ = face.indices.reduce((sum, idx) => {
          const r = rotatePoint(vertices[idx], rotationRef.current.x, rotationRef.current.y, rotationRef.current.z);
          return sum + r.z;
        }, 0) / 3;

        // Map depth to a rich brown/ink wash gradient with gold undertones
        const brightness = Math.max(0, Math.min(1, (normalZ + 1.2) / 2.4));
        const rVal = Math.floor(65 + brightness * 40); // Rich dark brown
        const gVal = Math.floor(50 + brightness * 35);
        const bVal = Math.floor(35 + brightness * 25);

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.lineTo(pts[2].x, pts[2].y);
        ctx.closePath();

        // Shaded face fill
        ctx.fillStyle = `rgb(${rVal}, ${gVal}, ${bVal})`;
        ctx.fill();

        // Premium gold trim lines
        ctx.strokeStyle = "rgba(230, 193, 92, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Highlight/shine stroke for front-most face
        if (normalZ > 0.4) {
          ctx.strokeStyle = "rgba(255, 235, 175, 0.7)";
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }

        // Render trigram symbol and labels on the face
        // Center of the face
        const cX = (pts[0].x + pts[1].x + pts[2].x) / 3;
        const cY = (pts[0].y + pts[1].y + pts[2].y) / 3;

        ctx.save();
        ctx.fillStyle = "rgba(230, 193, 92, 0.9)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        // Trigram Symbol (big and bold in gold)
        ctx.font = "bold 20px sans-serif";
        ctx.fillText(face.symbol, cX, cY - 8);

        // Trigram Label (smaller below symbol)
        ctx.font = "bold 9px sans-serif";
        ctx.fillStyle = "rgba(255, 245, 220, 0.8)";
        ctx.fillText(face.label, cX, cY + 12);
        ctx.restore();
      });

      // Subtle atmospheric bottom shadow
      ctx.beginPath();
      ctx.ellipse(center.x, center.y + scale * 1.3, scale * 0.8, scale * 0.15, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      ctx.fill();

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, []);

  // Handle dice physics and rotations based on rolling state
  useEffect(() => {
    if (isRolling) {
      // Spinning frantically
      speedRef.current = {
        x: 0.15 + Math.random() * 0.1,
        y: 0.12 + Math.random() * 0.1,
        z: 0.08 + Math.random() * 0.05
      };
      setDisplayedValue("神明感应 乾坤轮转...");
    } else {
      // Gradually slow down and snap to targeted angle if set
      const deceleration = setInterval(() => {
        speedRef.current.x *= 0.85;
        speedRef.current.y *= 0.85;
        speedRef.current.z *= 0.85;

        // Snap to minimal speed for aesthetic gentle floating
        if (Math.abs(speedRef.current.x) < 0.005) {
          speedRef.current = { x: 0.003, y: 0.002, z: 0.001 };
          clearInterval(deceleration);

          if (targetValue !== null) {
            setDisplayedValue(`卦象已定: ${TRIGRAM_LABELS[targetValue - 1]}`);
            if (onRollComplete) {
              onRollComplete(targetValue);
            }
          } else {
            setDisplayedValue("请诚心起卦");
          }
        }
      }, 50);

      return () => clearInterval(deceleration);
    }
  }, [isRolling, targetValue]);

  return (
    <div className="flex flex-col items-center justify-center p-2 relative">
      <div className="relative w-56 h-56 flex justify-center items-center">
        {/* Glow effect matching the picture */}
        <div className="absolute inset-0 bg-[#E6C15C]/10 rounded-full blur-3xl scale-75 animate-pulse" />
        <canvas 
          ref={canvasRef} 
          width={240} 
          height={240} 
          className="w-full h-full relative z-10 cursor-pointer"
        />
      </div>
      
      {/* Interactive indicator pill */}
      <div className="mt-4 px-6 py-2.5 bg-white rounded-full border border-gray-200/50 shadow-md shadow-yellow-500/5 flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-[#E6C15C] rounded-full animate-ping" />
        <span className="text-xs font-semibold text-[#967520] tracking-wider">
          {displayedValue}
        </span>
      </div>
    </div>
  );
}
