import { useEffect, useRef } from "preact/hooks";
import { mat4, vec3 } from "gl-matrix";

const SHADER_CODE = `
struct Uniforms {
  modelViewProjection : mat4x4<f32>,
  color : vec4<f32>,
};

@binding(0) @group(0) var<uniform> uniforms : Uniforms;

struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
};

@vertex
fn vs_main(@location(0) position : vec4<f32>) -> VertexOutput {
  var output : VertexOutput;
  output.Position = uniforms.modelViewProjection * position;
  return output;
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
  return uniforms.color;
}
`;

export default function BoatCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!navigator.gpu) {
      alert("WebGPU not supported on this browser.");
      return;
    }

    const init = async () => {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error("No GPU adapter found");
      const device = await adapter.requestDevice();
      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext("webgpu") as GPUCanvasContext;
      const format = navigator.gpu.getPreferredCanvasFormat();

      context.configure({
        device,
        format,
        alphaMode: "premultiplied",
      });

      // --- Geometry Data ---
      // Simple Boat (Pyramid)
      const boatVertices = new Float32Array([
        0.0, 1.0, 0.0,  -0.5, 0.0, 0.5,   0.5, 0.0, 0.5, // Front
        0.0, 1.0, 0.0,   0.5, 0.0, 0.5,   0.5, 0.0, -0.5, // Right
        0.0, 1.0, 0.0,   0.5, 0.0, -0.5, -0.5, 0.0, -0.5, // Back
        0.0, 1.0, 0.0,  -0.5, 0.0, -0.5,  -0.5, 0.0, 0.5, // Left
      ]);

      // Water (Large Plane)
      const waterSize = 50.0;
      const waterVertices = new Float32Array([
        -waterSize, 0, -waterSize,  waterSize, 0, -waterSize,  -waterSize, 0, waterSize,
        -waterSize, 0, waterSize,   waterSize, 0, -waterSize,   waterSize, 0, waterSize,
      ]);

      const boatBuffer = device.createBuffer({
        size: boatVertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(boatBuffer, 0, boatVertices);

      const waterBuffer = device.createBuffer({
        size: waterVertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(waterBuffer, 0, waterVertices);

      // --- Pipeline ---
      const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
          module: device.createShaderModule({ code: SHADER_CODE }),
          entryPoint: "vs_main",
          buffers: [{
            arrayStride: 12, // 3 floats * 4 bytes
            attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
          }],
        },
        fragment: {
          module: device.createShaderModule({ code: SHADER_CODE }),
          entryPoint: "fs_main",
          targets: [{ format }],
        },
        primitive: { topology: "triangle-list", cullMode: "none" },
        depthStencil: {
          depthWriteEnabled: true,
          depthCompare: "less",
          format: "depth24plus",
        },
      });

      // --- Uniforms ---
      // We need a uniform buffer large enough for MVP matrix (64 bytes) + Color (16 bytes)
      const uniformBufferSize = 64 + 16;
      const uniformBuffer = device.createBuffer({
        size: uniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
      });

      // Depth Texture
      let depthTexture: GPUTexture | null = null;

      const resizeDepth = () => {
         if (depthTexture) depthTexture.destroy();
         depthTexture = device.createTexture({
          size: [canvas.width, canvas.height],
          format: "depth24plus",
          usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
      };
      resizeDepth();

      // --- State ---
      let rotation = 0;
      const projectionMatrix = mat4.create();
      const viewMatrix = mat4.create();
      const modelMatrix = mat4.create();
      const mvpMatrix = mat4.create();
      const cameraPos = vec3.create();
      const targetPos = vec3.create();

      // --- Render Loop ---
      const frame = () => {
        rotation += 0.01;
        
        // Ensure canvas size matches display size
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          resizeDepth();
        }

        const commandEncoder = device.createCommandEncoder();
        const textureView = context.getCurrentTexture().createView();

        const renderPassDescriptor: GPURenderPassDescriptor = {
          colorAttachments: [{
            view: textureView,
            clearValue: { r: 0.5, g: 0.7, b: 0.9, a: 1.0 }, // Sky color
            loadOp: "clear",
            storeOp: "store",
          }],
          depthStencilAttachment: {
            view: depthTexture!.createView(),
            depthClearValue: 1.0,
            depthLoadOp: "clear",
            depthStoreOp: "store",
          },
        };

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, bindGroup);

        // --- 1. Main View (Third Person) ---
        // Viewport: Full Screen
        passEncoder.setViewport(0, 0, canvas.width, canvas.height, 0, 1);
        passEncoder.setScissorRect(0, 0, canvas.width, canvas.height);

        // Camera Logic
        mat4.perspective(projectionMatrix, (45 * Math.PI) / 180, canvas.width / canvas.height, 0.1, 100.0);
        
        // Boat is at (0,0,0) rotating. Camera is behind and above.
        const radius = 8;
        vec3.set(cameraPos, Math.sin(rotation) * radius, 4, Math.cos(rotation) * radius);
        vec3.set(targetPos, 0, 1, 0); // Look at center (boat)
        mat4.lookAt(viewMatrix, cameraPos, targetPos, [0, 1, 0]);

        // Draw Boat (Red)
        mat4.identity(modelMatrix);
        mat4.rotateY(modelMatrix, modelMatrix, rotation); // Boat rotates
        mat4.multiply(mvpMatrix, projectionMatrix, viewMatrix);
        mat4.multiply(mvpMatrix, mvpMatrix, modelMatrix);
        
        device.queue.writeBuffer(uniformBuffer, 0, mvpMatrix as Float32Array);
        device.queue.writeBuffer(uniformBuffer, 64, new Float32Array([0.8, 0.2, 0.2, 1.0])); // Red
        passEncoder.setVertexBuffer(0, boatBuffer);
        passEncoder.draw(12);

        // Draw Water (Blue)
        mat4.identity(modelMatrix);
        mat4.translate(modelMatrix, modelMatrix, [0, -0.1, 0]); // Slightly below boat
        mat4.multiply(mvpMatrix, projectionMatrix, viewMatrix);
        mat4.multiply(mvpMatrix, mvpMatrix, modelMatrix);

        device.queue.writeBuffer(uniformBuffer, 0, mvpMatrix as Float32Array);
        device.queue.writeBuffer(uniformBuffer, 64, new Float32Array([0.0, 0.3, 0.8, 1.0])); // Blue
        passEncoder.setVertexBuffer(0, waterBuffer);
        passEncoder.draw(6);


        // --- 2. Mini-Map View (Top Down) ---
        // Viewport: Bottom Left (200x200 px)
        const mapSize = 200;
        // In WebGPU viewport, Y starts from top, but we want bottom-left. 
        // Logic: y = height - mapSize - margin
        passEncoder.setViewport(20, canvas.height - mapSize - 20, mapSize, mapSize, 0, 1);
        passEncoder.setScissorRect(20, canvas.height - mapSize - 20, mapSize, mapSize);

        // Orthographic projection for map
        const zoom = 10;
        mat4.ortho(projectionMatrix, -zoom, zoom, -zoom, zoom, 1, 100);
        
        // Camera looking straight down
        vec3.set(cameraPos, 0, 50, 0);
        vec3.set(targetPos, 0, 0, 0);
        mat4.lookAt(viewMatrix, cameraPos, targetPos, [0, 0, -1]); // Up vector is -Z to align map north

        // Draw Boat on Map
        mat4.identity(modelMatrix);
        mat4.rotateY(modelMatrix, modelMatrix, rotation);
        mat4.multiply(mvpMatrix, projectionMatrix, viewMatrix);
        mat4.multiply(mvpMatrix, mvpMatrix, modelMatrix);
        
        // Make boat yellow on map for visibility
        device.queue.writeBuffer(uniformBuffer, 0, mvpMatrix as Float32Array);
        device.queue.writeBuffer(uniformBuffer, 64, new Float32Array([1.0, 1.0, 0.0, 1.0])); 
        passEncoder.setVertexBuffer(0, boatBuffer);
        passEncoder.draw(12);

        // Draw Water on Map
        mat4.identity(modelMatrix);
        mat4.multiply(mvpMatrix, projectionMatrix, viewMatrix);
        mat4.multiply(mvpMatrix, mvpMatrix, modelMatrix);
        
        device.queue.writeBuffer(uniformBuffer, 0, mvpMatrix as Float32Array);
        device.queue.writeBuffer(uniformBuffer, 64, new Float32Array([0.0, 0.2, 0.6, 1.0]));
        passEncoder.setVertexBuffer(0, waterBuffer);
        passEncoder.draw(6);


        passEncoder.end();
        device.queue.submit([commandEncoder.finish()]);
        requestAnimationFrame(frame);
      };

      requestAnimationFrame(frame);
    };

    init().catch(console.error);
  }, []);

  return (
    <div class="relative w-full h-screen bg-gray-900">
      <canvas ref={canvasRef} class="w-full h-full block" />
      {/* Overlay UI for context */}
      <div class="absolute bottom-6 left-6 w-[200px] h-[200px] border-2 border-white pointer-events-none">
        <p class="text-white text-xs absolute -top-6 left-0 font-bold uppercase">Mini-Map</p>
      </div>
      <div class="absolute top-4 left-4 text-white bg-black/50 p-2 rounded">
        <h2 class="font-bold">Project P1R4T3</h2>
        <p class="text-sm">WebGPU Third Person View</p>
      </div>
    </div>
  );
}