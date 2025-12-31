import { useEffect, useRef } from "preact/hooks";
import type { Theme } from "./App.tsx";

interface BoatCanvasProps {
  device: GPUDevice;
  theme: Theme;
}

export default function BoatCanvas({ device, theme }: BoatCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize/Resize Canvas context
  useEffect(() => {
    if (!canvasRef.current || !device) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext("webgpu");

    if (!context) {
      console.error("Could not get WebGPU context");
      return;
    }

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    
    context.configure({
      device,
      format: presentationFormat,
      alphaMode: "premultiplied",
    });

    // TODO: Add your render loop or class initialization here
    console.log("Canvas configured with theme:", theme);

  }, [device]); // Re-run if device changes

  // Handle Theme Changes (Send to shaders/render loop)
  useEffect(() => {
    if (!canvasRef.current || !device) return;
    
    // Logic to update uniforms/colors based on theme
    console.log("Theme updated in canvas:", theme);
    
    // Example: dispatch event if you are using an external class that listens to DOM events
    canvasRef.current.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }));
    
  }, [theme, device]);

  return (
    <canvas 
      ref={canvasRef} 
      id="boat-canvas" 
      className="w-full h-screen block"
      width={window.innerWidth}
      height={window.innerHeight}
    />
  );
}