import { useEffect, useRef } from "preact/hooks";
import { mat4, vec3 } from "gl-matrix";
import type { Theme } from "./App.tsx";

interface BoatCanvasProps {
  device: GPUDevice;
  theme: Theme;
}

// --- WGSL Shaders (Unchanged) ---
const shaderCode = `
struct Uniforms {
  modelViewProjectionMatrix : mat4x4<f32>,
  normalMatrix : mat4x4<f32>,
  lightDirection : vec3<f32>,
}
@binding(0) @group(0) var<uniform> uniforms : Uniforms;

struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) vColor : vec4<f32>,
  @location(1) vNormal : vec3<f32>,
}

@vertex
fn vs_main(
  @location(0) position : vec3<f32>,
  @location(1) color : vec3<f32>,
  @location(2) normal : vec3<f32>
) -> VertexOutput {
  var output : VertexOutput;
  output.Position = uniforms.modelViewProjectionMatrix * vec4<f32>(position, 1.0);
  output.vNormal = (uniforms.normalMatrix * vec4<f32>(normal, 0.0)).xyz;
  output.vColor = vec4<f32>(color, 1.0);
  return output;
}

@fragment
fn fs_main(@location(0) vColor : vec4<f32>, @location(1) vNormal : vec3<f32>) -> @location(0) vec4<f32> {
  let normal = normalize(vNormal);
  let lightDir = normalize(uniforms.lightDirection);
  let diffuse = max(dot(normal, lightDir), 0.2);
  return vec4<f32>(vColor.rgb * diffuse, vColor.a);
}
`;

// --- Geometry Generation Helper (Unchanged) ---
function createBox(
  x: number, y: number, z: number, 
  w: number, h: number, d: number, 
  r: number, g: number, b: number
): number[] {
  const x1 = x - w/2, x2 = x + w/2;
  const y1 = y - h/2, y2 = y + h/2;
  const z1 = z - d/2, z2 = z + d/2;

  // Format: pos(3), color(3), normal(3)
  // deno-fmt-ignore
  const vertices = [
    // Front
    x1, y1, z2, r, g, b, 0, 0, 1,
    x2, y1, z2, r, g, b, 0, 0, 1,
    x2, y2, z2, r, g, b, 0, 0, 1,
    x1, y1, z2, r, g, b, 0, 0, 1,
    x2, y2, z2, r, g, b, 0, 0, 1,
    x1, y2, z2, r, g, b, 0, 0, 1,
    // Back
    x2, y1, z1, r, g, b, 0, 0, -1,
    x1, y1, z1, r, g, b, 0, 0, -1,
    x1, y2, z1, r, g, b, 0, 0, -1,
    x2, y1, z1, r, g, b, 0, 0, -1,
    x1, y2, z1, r, g, b, 0, 0, -1,
    x2, y2, z1, r, g, b, 0, 0, -1,
    // Top
    x1, y2, z2, r, g, b, 0, 1, 0,
    x2, y2, z2, r, g, b, 0, 1, 0,
    x2, y2, z1, r, g, b, 0, 1, 0,
    x1, y2, z2, r, g, b, 0, 1, 0,
    x2, y2, z1, r, g, b, 0, 1, 0,
    x1, y2, z1, r, g, b, 0, 1, 0,
    // Bottom
    x1, y1, z1, r, g, b, 0, -1, 0,
    x2, y1, z1, r, g, b, 0, -1, 0,
    x2, y1, z2, r, g, b, 0, -1, 0,
    x1, y1, z1, r, g, b, 0, -1, 0,
    x2, y1, z2, r, g, b, 0, -1, 0,
    x1, y1, z2, r, g, b, 0, -1, 0,
    // Right
    x2, y1, z2, r, g, b, 1, 0, 0,
    x2, y1, z1, r, g, b, 1, 0, 0,
    x2, y2, z1, r, g, b, 1, 0, 0,
    x2, y1, z2, r, g, b, 1, 0, 0,
    x2, y2, z1, r, g, b, 1, 0, 0,
    x2, y2, z2, r, g, b, 1, 0, 0,
    // Left
    x1, y1, z1, r, g, b, -1, 0, 0,
    x1, y1, z2, r, g, b, -1, 0, 0,
    x1, y2, z2, r, g, b, -1, 0, 0,
    x1, y1, z1, r, g, b, -1, 0, 0,
    x1, y2, z2, r, g, b, -1, 0, 0,
    x1, y2, z1, r, g, b, -1, 0, 0,
  ];
  return vertices;
}

// Helper to adjust color brightness
function adjustBrightness(color: [number, number, number], factor: number): [number, number, number] {
  return [
    Math.min(1, color[0] * factor),
    Math.min(1, color[1] * factor),
    Math.min(1, color[2] * factor),
  ];
}

export default function BoatCanvas({ device, theme }: BoatCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Camera State 
  const cameraState = useRef({
    theta: -Math.PI / 4,
    phi: Math.PI / 6,   
    radius: 12,          
    isDragging: false,
    lastX: 0,
    lastY: 0,
    lastPinchDist: 0,
  });

  useEffect(() => {
    if (!canvasRef.current || !device) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext("webgpu");
    if (!context) return;

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    
    context.configure({
      device,
      format: presentationFormat,
      alphaMode: "premultiplied",
    });

    // Base colors (daytime brightness)
    const baseColors = {
      hull: [0.2, 0.4, 0.8] as [number, number, number],
      cabin: [0.9, 0.9, 0.9] as [number, number, number],
      roof: [0.2, 0.4, 0.8] as [number, number, number],
      chimney: [1.0, 0.8, 0.1] as [number, number, number],
      front: [0.1, 0.2, 0.5] as [number, number, number],
    };

    // Dark mode = night (darker), Light mode = day (bright)
    const brightnessFactor = theme === "dark" ? 0.35 : 1.0;
    const adjustedColors = {
      hull: adjustBrightness(baseColors.hull, brightnessFactor),
      cabin: adjustBrightness(baseColors.cabin, brightnessFactor),
      roof: adjustBrightness(baseColors.roof, brightnessFactor),
      chimney: adjustBrightness(baseColors.chimney, brightnessFactor),
      front: adjustBrightness(baseColors.front, brightnessFactor),
    };

    // 1. Prepare Geometry with theme-based colors
    const vertexData = new Float32Array([
      // Hull (Blue)
      ...createBox(0, -1.0, 0, 3.0, 1.2, 5.0, ...adjustedColors.hull),
      // Cabin Base (White)
      ...createBox(0, 0.5, 0.5, 2.2, 1.8, 2.5, ...adjustedColors.cabin),
      // Roof (Blue)
      ...createBox(0, 1.5, 0.5, 2.4, 0.2, 2.8, ...adjustedColors.roof),
      // Chimney (Yellow/Gold)
      ...createBox(0, 2.2, 0.0, 0.6, 1.2, 0.6, ...adjustedColors.chimney),
      // Front Box/Detail (Dark Blue)
      ...createBox(0, -0.2, 2.0, 1.5, 0.5, 1.5, ...adjustedColors.front),
    ]);

    const vertexBuffer = device.createBuffer({
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    new Float32Array(vertexBuffer.getMappedRange()).set(vertexData);
    vertexBuffer.unmap();

    // 2. Uniform Buffer
    const uniformBufferSize = 64 + 64 + 16; 
    const uniformBuffer = device.createBuffer({
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // 3. Pipeline
    const module = device.createShaderModule({ code: shaderCode });
    const pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module,
        entryPoint: "vs_main",
        buffers: [{
          arrayStride: 9 * 4, 
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x3" },
            { shaderLocation: 1, offset: 3 * 4, format: "float32x3" },
            { shaderLocation: 2, offset: 6 * 4, format: "float32x3" },
          ],
        }],
      },
      fragment: {
        module,
        entryPoint: "fs_main",
        targets: [{ format: presentationFormat }],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "back",
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: "less",
        format: "depth24plus",
      },
    });

    const depthTexture = device.createTexture({
      size: [canvas.width, canvas.height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
      ],
    });

    // --- Input Handling: Mouse (Desktop) ---
    const handleMouseDown = (e: MouseEvent) => {
      cameraState.current.isDragging = true;
      cameraState.current.lastX = e.clientX;
      cameraState.current.lastY = e.clientY;
    };
    
    const handleMouseUp = () => {
      cameraState.current.isDragging = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!cameraState.current.isDragging) return;
      const deltaX = e.clientX - cameraState.current.lastX;
      const deltaY = e.clientY - cameraState.current.lastY;
      
      cameraState.current.theta -= deltaX * 0.01;
      cameraState.current.phi -= deltaY * 0.01;
      cameraState.current.phi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraState.current.phi));
      
      cameraState.current.lastX = e.clientX;
      cameraState.current.lastY = e.clientY;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraState.current.radius += e.deltaY * 0.01;
      cameraState.current.radius = Math.max(2, Math.min(50, cameraState.current.radius));
    };

    // --- Input Handling: Touch (Mobile) ---
    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        cameraState.current.isDragging = true;
        cameraState.current.lastX = e.touches[0].clientX;
        cameraState.current.lastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        cameraState.current.isDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        cameraState.current.lastPinchDist = Math.hypot(dx, dy);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && cameraState.current.isDragging) {
        const touch = e.touches[0];
        const deltaX = touch.clientX - cameraState.current.lastX;
        const deltaY = touch.clientY - cameraState.current.lastY;
        
        cameraState.current.theta -= deltaX * 0.01;
        cameraState.current.phi -= deltaY * 0.01;
        cameraState.current.phi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraState.current.phi));
        
        cameraState.current.lastX = touch.clientX;
        cameraState.current.lastY = touch.clientY;
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        
        const deltaDist = cameraState.current.lastPinchDist - dist;
        cameraState.current.radius += deltaDist * 0.05;
        cameraState.current.radius = Math.max(2, Math.min(50, cameraState.current.radius));
        
        cameraState.current.lastPinchDist = dist;
      }
    };

    const handleTouchEnd = () => {
      cameraState.current.isDragging = false;
    };

    // Event Listeners
    canvas.addEventListener("mousedown", handleMouseDown);
    globalThis.window.addEventListener("mouseup", handleMouseUp);
    globalThis.window.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    
    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd);

    // 5. Render Loop
    let animationFrameId: number;
    let startTime = performance.now();

    const render = () => {
      const now = (performance.now() - startTime) / 1000;

      // Matrices
      const projectionMatrix = mat4.create();
      const aspect = canvas.width / canvas.height;
      mat4.perspective(projectionMatrix, (2 * Math.PI) / 5, aspect, 1, 100.0);

      const viewMatrix = mat4.create();
      const { theta, phi, radius } = cameraState.current;
      const camX = radius * Math.sin(phi) * Math.sin(theta);
      const camY = radius * Math.cos(phi);
      const camZ = radius * Math.sin(phi) * Math.cos(theta);
      mat4.lookAt(viewMatrix, [camX, camY, camZ], [0, 0, 0], [0, 1, 0]);

      const modelMatrix = mat4.create();
      const bobY = Math.sin(now * 2) * 0.2; 
      const rockZ = Math.sin(now * 1.5) * 0.05;
      const pitchX = Math.cos(now * 1.2) * 0.05;

      mat4.translate(modelMatrix, modelMatrix, [0, bobY, 0]);
      mat4.rotateZ(modelMatrix, modelMatrix, rockZ);
      mat4.rotateX(modelMatrix, modelMatrix, pitchX);

      const mvpMatrix = mat4.create();
      mat4.multiply(mvpMatrix, viewMatrix, modelMatrix);
      mat4.multiply(mvpMatrix, projectionMatrix, mvpMatrix);

      const normalMatrix = mat4.create();
      mat4.invert(normalMatrix, modelMatrix);
      mat4.transpose(normalMatrix, normalMatrix);

      const lightDir = vec3.fromValues(0.5, 1.0, 0.8);

      const uniformData = new Float32Array(uniformBufferSize / 4);
      uniformData.set(mvpMatrix as Float32Array, 0);      
      uniformData.set(normalMatrix as Float32Array, 16);   
      uniformData.set(lightDir as Float32Array, 32);       
      
      device.queue.writeBuffer(uniformBuffer, 0, uniformData);

      const commandEncoder = device.createCommandEncoder();
      const textureView = context.getCurrentTexture().createView();

      // TRANSPARENT BACKGROUND - always clear to transparent
      const clearColor = { r: 0, g: 0, b: 0, a: 0 };

      const renderPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [{
          view: textureView,
          clearValue: clearColor,
          loadOp: "clear",
          storeOp: "store",
        }],
        depthStencilAttachment: {
          view: depthTexture.createView(),
          depthClearValue: 1.0,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      };

      const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.setVertexBuffer(0, vertexBuffer);
      passEncoder.draw(vertexData.length / 9);
      passEncoder.end();

      device.queue.submit([commandEncoder.finish()]);
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
    };

  }, [device, theme]); 

  return (
    <div className="relative w-full h-screen touch-none">
      <canvas 
        ref={canvasRef} 
        id="boat-canvas" 
        className="w-full h-full block cursor-move bg-transparent"
        width={window.innerWidth}
        height={window.innerHeight}
      />
    </div>
  );
}